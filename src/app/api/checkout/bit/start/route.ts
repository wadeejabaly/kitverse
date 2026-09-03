import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import {
  CreateOrderRequestSchema,
  FIXED_COUNTRY,
  orderReference,
  type CheckoutErrorCode,
} from "@/lib/checkout";
import { isBitCodConfigured } from "@/lib/bit";
import { announceCodOrder } from "@/lib/order-service";
import { codOrderRow, repriceCart } from "@/lib/orders";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/checkout/bit/start — cash on delivery, reserved by a Bit deposit.
 *
 * The shortest money path in the store, because no money moves through it. It
 * follows the same order of operations as the two card routes for the same
 * reasons:
 *   1. validate the request shape (Zod, always — the same wire contract, so
 *      the required delivery region is enforced here identically);
 *   2. RECOMPUTE the cart from the catalogue and pricing.ts. No price arrives
 *      from the browser and none would be honoured if it did;
 *   3. compute the deposit from THAT total — the checkout screen showed the
 *      buyer a figure, and this route does not look at it;
 *   4. write the order as `awaiting_deposit` / `bit_cod` with the deposit
 *      recorded, then its line snapshots;
 *   5. tell the owner immediately.
 *
 * STEP 5 IS THE DIFFERENCE FROM THE CARD ROUTES, and it is not an oversight.
 * They notify when a processor confirms payment; here the payment is a Bit
 * transfer that arrives in the owner's own phone with nothing but an order
 * reference in the note, so the owner has to have been told the order exists
 * before it lands. Fire-and-forget after the response, like every other
 * notification: an order that was written is not un-written by a mail failure.
 *
 * NOTHING HERE EVER SETTLES ANYTHING. The row leaves this route
 * `awaiting_deposit` and only a human moves it to `paid`, in the Supabase
 * dashboard, after seeing the money (see supabase/migrations/0004_bit_cod.sql).
 *
 * The owner's Bit number is NOT in the response. The buyer is shown it on the
 * confirmation page, which renders it server-side against the order row this
 * route wrote — so the number reaches a browser only for someone who has
 * actually placed an order, and never as part of an API payload that could be
 * fetched for it.
 */

export const dynamic = "force-dynamic";

/** Same budget as the two card start routes. Best effort — see rate-limit.ts. */
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

  // Both halves must be present before anything is written: an order with no
  // number to send a deposit to is an order that can never be fulfilled.
  const db = getSupabaseAdmin();
  if (!db || !isBitCodConfigured()) {
    return errorResponse("payments_unconfigured", 503);
  }

  // The server's own arithmetic. Whatever the browser displayed is irrelevant
  // from here on — including the deposit it displayed.
  const cart = repriceCart(items, customer.region);
  if (cart.dropped.length > 0) {
    console.warn(`[checkout] dropped unavailable handles: ${cart.dropped.join(", ")}`);
  }
  if (cart.lines.length === 0 || cart.total <= 0) {
    return errorResponse("cart_empty", 400);
  }

  // Status, rail and deposit in one place, derived from the server total.
  // This route contains no other provider or status literal, which is what
  // makes it impossible for it to create a card order.
  const cod = codOrderRow(cart.total);

  const { data: inserted, error: insertError } = await db
    .from("orders")
    .insert({
      ...cod,
      customer_name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      delivery_region: customer.region,
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
    console.error("[checkout] COD order insert failed:", insertError?.message);
    return errorResponse("server_error", 500);
  }

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
    console.error("[checkout] COD order_items insert failed:", itemsError.message);
    // An order with no lines cannot be packed. Marked failed rather than
    // deleted, so the attempt stays visible.
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("server_error", 500);
  }

  after(async () => {
    await announceCodOrder(db, orderId);
  });

  return NextResponse.json({
    reference: orderReference(orderId),
    // Echoed so the browser can show what the server actually recorded. Both
    // are the server's numbers either way; the confirmation page reads them
    // back out of the database rather than trusting these.
    total: cart.total,
    deposit: cod.deposit_ils,
  });
}
