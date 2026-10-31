import { NextResponse, type NextRequest } from "next/server";
import { captureOrder } from "@/lib/payments/paypal";
import { getOrderForSettlement, settleOnlinePayment } from "@/lib/orders/online";
import { readOrderToken } from "@/lib/orders/link";
import { orderReference } from "@/lib/checkout";
import { env } from "@/lib/env";

/**
 * Where PayPal sends the buyer's browser back after they approve (or decline
 * to approve) in the Orders v2 redirect flow — PayPal appends its own
 * `token` (the PayPal order id) to the return_url we gave it
 * (/api/checkout/paypal/start). `order`/`t` are ours, from that same URL, and
 * are what tie this request back to a specific row: `t` has to verify against
 * `order` before anything here is trusted, since a GET request's query
 * string is exactly the kind of thing a link can be shared or guessed.
 *
 * A redirect landing here is NOT evidence of payment — only capture's own
 * "COMPLETED" status is (see src/lib/payments/paypal.ts's doc comment).
 * PayPal's webhook (/api/paypal/webhook) can also settle the same order; the
 * UPDATE guard in settleOnlinePayment is what makes whichever one arrives
 * first the one that counts.
 */
export async function GET(req: NextRequest) {
  const site = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { searchParams } = req.nextUrl;
  const orderId = searchParams.get("order") ?? "";
  const token = searchParams.get("t") ?? "";
  const paypalOrderId = searchParams.get("token") ?? "";

  if (!orderId || !paypalOrderId || readOrderToken(token) !== orderId) {
    return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });
  }

  const captured = await captureOrder(paypalOrderId);
  if (!captured.ok || captured.value.status !== "COMPLETED" || !captured.value.captureId) {
    if (!captured.ok) console.error("paypal capture failed", captured.code, captured.detail);
    return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });
  }

  const existing = await getOrderForSettlement(orderId);
  if (!existing) return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });

  // amount isn't re-checked against PayPal's own response here: this capture
  // is of the exact PayPal order /api/checkout/paypal/start minted for OUR
  // total — nothing in the approval step lets the buyer change what they're
  // paying. The order's own stored total is what the payments row records.
  // Whether THIS call settles it or it was already settled by the webhook
  // arriving first, the order exists and is paid either way.
  await settleOnlinePayment({
    orderId,
    provider: "paypal",
    providerOrderId: paypalOrderId,
    captureId: captured.value.captureId,
    amountAgorot: existing.totalAgorot,
    raw: captured.value,
  });

  return NextResponse.redirect(`${site}/checkout/thank-you?ref=${orderReference(orderId)}&t=${encodeURIComponent(token)}`, { status: 303 });
}
