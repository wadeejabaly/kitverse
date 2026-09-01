import { NextResponse, type NextRequest } from "next/server";
import {
  CreateOrderRequestSchema,
  FIXED_COUNTRY,
  orderReference,
  type CheckoutErrorCode,
} from "@/lib/checkout";
import { repriceCart } from "@/lib/orders";
import { createOrder as createPayPalOrder, isPayPalConfigured } from "@/lib/paypal";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/checkout/create-order — the start of the money path.
 *
 * The order of operations is the whole point:
 *   1. validate the request shape (Zod, always);
 *   2. RECOMPUTE the cart from the catalogue and pricing.ts, dropping any
 *      line whose handle is not a visible product. No price arrives from the
 *      browser and none would be honoured if it did;
 *   3. write a `pending` order row BEFORE PayPal is told anything, so a
 *      payment can never exist without a row to attach it to;
 *   4. create the PayPal order for OUR total, stamped with our order id;
 *   5. store the PayPal order id and hand it back.
 *
 * If step 4 fails the row is marked `failed` and stays as evidence.
 */

export const dynamic = "force-dynamic";

/** ~1 order attempt per 6s per IP, bursting to 5. Best effort — see rate-limit.ts. */
const LIMIT = { capacity: 5, refillPerSecond: 1 / 6 };

function errorResponse(code: CheckoutErrorCode, status: number, extra?: ResponseInit) {
  return NextResponse.json({ code }, { status, ...extra });
}

export async function POST(request: NextRequest) {
  const verdict = rateLimit(clientIp(request.headers), LIMIT);
  if (!verdict.allowed) {
    return errorResponse("rate_limited", 429, {
      headers: { "Retry-After": String(verdict.retryAfterSeconds) },
    });
  }

  const json = await request.json().catch(() => null);
  const parsed = CreateOrderRequestSchema.safeParse(json);
  if (!parsed.success) return errorResponse("invalid_request", 400);
  const { items, customer, locale } = parsed.data;

  // Both integrations must be present before anything is written: a pending
  // row with no possible payment is litter.
  const db = getSupabaseAdmin();
  if (!db || !isPayPalConfigured()) {
    return errorResponse("payments_unconfigured", 503);
  }

  // The server's own arithmetic. Whatever the browser displayed is irrelevant
  // from here on.
  const cart = repriceCart(items);
  if (cart.dropped.length > 0) {
    console.warn(`[checkout] dropped unavailable handles: ${cart.dropped.join(", ")}`);
  }
  if (cart.lines.length === 0 || cart.total <= 0) {
    return errorResponse("cart_empty", 400);
  }

  const { data: inserted, error: insertError } = await db
    .from("orders")
    .insert({
      status: "pending",
      customer_name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      country: FIXED_COUNTRY,
      notes: customer.notes ?? null,
      locale,
      subtotal_ils: cart.subtotal,
      shipping_ils: cart.shipping,
      total_ils: cart.total,
    })
    .select("id")
    .single();

  const orderId = (inserted as { id: string } | null)?.id;
  if (insertError || !orderId) {
    console.error("[checkout] order insert failed:", insertError?.message);
    return errorResponse("server_error", 500);
  }

  // Line snapshots: what was bought, at the price the server computed, frozen
  // against a later catalogue rebuild.
  const { error: itemsError } = await db.from("order_items").insert(
    cart.lines.map((line) => ({
      order_id: orderId,
      handle: line.handle,
      title_snapshot: line.title,
      size: line.size,
      version: line.version,
      name_number: line.nameNumber,
      badge: line.badge,
      unit_price_ils: line.unitPrice,
      qty: line.qty,
    })),
  );
  if (itemsError) {
    console.error("[checkout] order_items insert failed:", itemsError.message);
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("server_error", 500);
  }

  const paypal = await createPayPalOrder(cart.total, orderId);
  if (!paypal.ok) {
    console.error(`[checkout] PayPal createOrder failed (${paypal.code}): ${paypal.detail}`);
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("paypal_failed", 502);
  }

  const { error: linkError } = await db
    .from("orders")
    .update({ paypal_order_id: paypal.value.paypalOrderId })
    .eq("id", orderId);
  if (linkError) {
    // Without the link a later capture or webhook could not find this row, so
    // this is fatal to the attempt even though PayPal has an order.
    console.error("[checkout] could not store paypal_order_id:", linkError.message);
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("server_error", 500);
  }

  return NextResponse.json({
    paypalOrderId: paypal.value.paypalOrderId,
    reference: orderReference(orderId),
    // Echoed so the browser can show the customer what the server actually
    // charged, if the two ever differ. It is the server's number either way.
    total: cart.total,
  });
}
