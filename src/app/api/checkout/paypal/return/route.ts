import { NextResponse, type NextRequest } from "next/server";
import { captureMatchesOrder, captureOrder } from "@/lib/payments/paypal";
import { getOrderForSettlement, getPendingProviderOrderId, settleOnlinePayment } from "@/lib/orders/online";
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

  const existing = await getOrderForSettlement(orderId);
  if (!existing) return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });
  const thanks = `${site}/checkout/thank-you?ref=${orderReference(orderId)}&t=${encodeURIComponent(token)}`;
  if (existing.paymentStatus === "paid") return NextResponse.redirect(thanks, { status: 303 }); // webhook got there first

  // The PayPal order must be the one /api/checkout/paypal/start minted for THIS order - otherwise a
  // cheap order's approved payment could be replayed against an expensive order's return link.
  if ((await getPendingProviderOrderId(orderId, "paypal")) !== paypalOrderId) {
    console.error("paypal return: PayPal order does not belong to this order", orderId);
    return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });
  }

  const captured = await captureOrder(paypalOrderId);
  if (!captured.ok || captured.value.status !== "COMPLETED" || !captured.value.captureId) {
    if (!captured.ok) console.error("paypal capture failed", captured.code, captured.detail);
    return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });
  }
  // Only completed money for exactly this order's total counts. A PENDING capture (held for review)
  // is settled later by the PAYMENT.CAPTURE.COMPLETED webhook.
  if (!captureMatchesOrder({ ...captured.value, status: captured.value.captureStatus ?? "" }, orderId, existing.totalAgorot)) {
    console.error("paypal return: capture not settled", orderId, captured.value.captureStatus, captured.value.currency, captured.value.amountAgorot);
    return NextResponse.redirect(`${site}/checkout?pay=${captured.value.captureStatus === "PENDING" ? "pending" : "failed"}`, { status: 303 });
  }

  await settleOnlinePayment({
    orderId,
    provider: "paypal",
    providerOrderId: paypalOrderId,
    captureId: captured.value.captureId,
    amountAgorot: existing.totalAgorot,
    raw: captured.value,
  });

  return NextResponse.redirect(thanks, { status: 303 });
}
