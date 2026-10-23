import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import {
  CreateOrderRequestSchema,
  FIXED_COUNTRY,
  orderReference,
  type CheckoutErrorCode,
} from "@/lib/checkout";
import { announceCashOrder } from "@/lib/order-service";
import { cashOrderRow, repriceCart } from "@/lib/orders";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/checkout/cash/start — plain cash on delivery (owner decision
 * 2026-10-23, replacing the Bit-deposit rail: no deposit, the buyer pays the
 * courier in full on arrival).
 *
 * The shortest money path in the store, because no money moves through it at
 * all. It follows the same order of operations as the two card routes for the
 * same reasons:
 *   1. validate the request shape (Zod, always — the same wire contract, so
 *      the required delivery region and the gift-box quantity are enforced
 *      here identically);
 *   2. RECOMPUTE the cart from the catalogue and pricing.ts. No price arrives
 *      from the browser and none would be honoured if it did;
 *   3. write the order as `pending` / `cash` — the SAME status a card order
 *      starts in, which is safe only because `decidePaidTransition` rejects
 *      any settlement attempt on a non-settleable provider regardless of
 *      status (src/lib/orders.ts);
 *   4. write its line snapshots;
 *   5. tell the owner immediately.
 *
 * STEP 5 IS THE SAME AS THE OLD COD ROUTE, for a related but different
 * reason: there is no later "paid" moment to notify on, because the money
 * changes hands at the door, not through this application. Fire-and-forget
 * after the response, like every other notification: an order that was
 * written is not un-written by a mail failure.
 *
 * NOTHING HERE EVER SETTLES ANYTHING THROUGH A CALLBACK. `cash` is excluded
 * from SettleableProvider, so no webhook on any endpoint can touch this row —
 * see supabase/migrations/0005_cash_on_delivery_and_gift_box.sql.
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
  const { items, customer, locale, giftBoxQty } = parsed.data;

  const db = getSupabaseAdmin();
  if (!db) {
    return errorResponse("payments_unconfigured", 503);
  }

  // The server's own arithmetic. Whatever the browser displayed is irrelevant
  // from here on.
  const cart = repriceCart(items, customer.region, giftBoxQty);
  if (cart.dropped.length > 0) {
    console.warn(`[checkout] dropped unavailable handles: ${cart.dropped.join(", ")}`);
  }
  if (cart.lines.length === 0 || cart.total <= 0) {
    return errorResponse("cart_empty", 400);
  }

  // Status and rail in one place. This route contains no other provider or
  // status literal, which is what makes it impossible for it to create a
  // card order.
  const cash = cashOrderRow();

  const { data: inserted, error: insertError } = await db
    .from("orders")
    .insert({
      ...cash,
      customer_name: customer.name,
      email: customer.email,
      phone: customer.phone,
      street: customer.street,
      house_number: customer.houseNumber,
      // Legacy combined column, kept in step for anything still reading it.
      address: `${customer.street} ${customer.houseNumber}`.trim(),
      city: customer.city,
      delivery_region: customer.region,
      country: FIXED_COUNTRY,
      notes: customer.notes ?? null,
      locale,
      subtotal_ils: cart.subtotal,
      shipping_ils: cart.shipping,
      gift_box_qty: cart.giftBoxQty,
      gift_box_ils: cart.giftBox,
      total_ils: cart.total,
    })
    .select("id")
    .single();

  const orderId = (inserted as { id: string } | null)?.id;
  if (insertError || !orderId) {
    console.error("[checkout] cash order insert failed:", insertError?.message);
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
      patch: line.patch === "none" ? null : line.patch,
      unit_price_ils: line.unitPrice,
      qty: line.qty,
    })),
  );
  if (itemsError) {
    console.error("[checkout] cash order_items insert failed:", itemsError.message);
    // An order with no lines cannot be packed. Marked failed rather than
    // deleted, so the attempt stays visible.
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("server_error", 500);
  }

  after(async () => {
    await announceCashOrder(db, orderId);
  });

  return NextResponse.json({
    reference: orderReference(orderId),
    // Echoed so the browser can show what the server actually recorded. It
    // is the server's number either way; the confirmation page never shows
    // the total at all (see thank-you/page.tsx).
    total: cart.total,
  });
}
