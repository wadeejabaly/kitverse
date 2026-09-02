import { NextResponse, type NextRequest } from "next/server";
import {
  CreateOrderRequestSchema,
  FIXED_COUNTRY,
  orderReference,
  type CheckoutErrorCode,
} from "@/lib/checkout";
import { repriceCart } from "@/lib/orders";
import { generatePaymentLink, isPayPlusConfigured } from "@/lib/payplus";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSiteUrl, localePath } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/checkout/payplus/start — the card path's half of the money path.
 *
 * PayPlus clears the card on a hosted page it owns, so this route's job ends
 * with a URL to send the buyer to. The order of operations is the same one
 * /api/checkout/create-order follows, and for the same reasons:
 *   1. validate the request shape (Zod, always);
 *   2. RECOMPUTE the cart from the catalogue and pricing.ts, dropping any
 *      line whose handle is not a visible product. No price arrives from the
 *      browser and none would be honoured if it did;
 *   3. write a `pending` order row BEFORE PayPlus is told anything, so a
 *      payment can never exist without a row to attach it to;
 *   4. mint the payment page for OUR total, stamped with our order id in
 *      more_info so the callback finds its way home;
 *   5. store the page request uid and hand back the redirect URL.
 *
 * If step 4 fails the row is marked `failed` and stays as evidence.
 *
 * NOTHING about the payment is decided here. This route never learns whether
 * the card was charged; that is the webhook's job, and only after asking
 * PayPlus directly.
 */

export const dynamic = "force-dynamic";

/** Same budget as the PayPal create-order route. Best effort — see rate-limit.ts. */
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

  const db = getSupabaseAdmin();
  if (!db || !isPayPlusConfigured()) {
    return errorResponse("payments_unconfigured", 503);
  }

  // The server's own arithmetic. Whatever the browser displayed is irrelevant
  // from here on.
  const cart = repriceCart(items, customer.region);
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
      // This row may only ever be settled by a PayPlus transaction.
      payment_provider: "payplus",
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
    console.error("[checkout] order insert failed:", insertError?.message);
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
    console.error("[checkout] order_items insert failed:", itemsError.message);
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("server_error", 500);
  }

  const reference = orderReference(orderId);
  const site = getSiteUrl();

  const link = await generatePaymentLink({
    orderId,
    amount: cart.total,
    customerName: customer.name,
    customerEmail: customer.email,
    // Shipping travels as its own line so the items add up to the amount
    // charged. A hosted page that lists items totalling less than it bills
    // for is a support ticket waiting to happen, whether or not PayPlus
    // itself objects.
    items: [
      ...cart.lines.map((line) => ({
        name: describeLine(line.title, line.size, line.version),
        quantity: line.qty,
        price: line.unitPrice,
      })),
      { name: "Shipping", quantity: 1, price: cart.shipping },
    ],
    // Locale-aware: `ar` lives at `/`, `en` at `/en`. Built from getSiteUrl()
    // so the domain still lives in exactly one place.
    successUrl: `${site}${localePath(locale, "/checkout/thank-you")}?ref=${reference}`,
    failureUrl: `${site}${localePath(locale, "/checkout")}?pay=failed`,
    cancelUrl: `${site}${localePath(locale, "/checkout")}?pay=cancelled`,
    callbackUrl: `${site}/api/payplus/webhook`,
  });

  if (!link.ok) {
    console.error(`[checkout] PayPlus generateLink failed (${link.code}): ${link.detail}`);
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("payplus_failed", 502);
  }

  const { error: linkError } = await db
    .from("orders")
    .update({ payplus_page_request_uid: link.value.pageRequestUid })
    .eq("id", orderId);
  if (linkError) {
    // Without the link the callback could not resolve this row by page uid.
    // more_info would still carry the order id, but a money path does not run
    // on one identifier when it was designed for two.
    console.error("[checkout] could not store payplus_page_request_uid:", linkError.message);
    await db.from("orders").update({ status: "failed" }).eq("id", orderId);
    return errorResponse("server_error", 500);
  }

  return NextResponse.json({
    redirectUrl: link.value.paymentPageLink,
    reference,
    // Echoed so the browser can show what the server actually charged. It is
    // the server's number either way.
    total: cart.total,
  });
}

/** What one line looks like on the hosted page. English: so is the page. */
function describeLine(title: string, size: string, version: string): string {
  return `${title} — ${size} / ${version}`.slice(0, 120);
}
