import { NextResponse, type NextRequest } from "next/server";
import { captureFacts, captureMatchesOrder, verifyWebhookSignature } from "@/lib/payments/paypal";
import { flagReversedPayment, getOrderForSettlement, settleOnlinePayment } from "@/lib/orders/online";

/**
 * PayPal's own notification — the second, independent path to settlement
 * (the buyer's own redirect, /api/checkout/paypal/return, is the other).
 * This exists because a buyer who approves and then closes the tab before
 * the redirect completes must still have their order paid; it is NOT the
 * event this store waits on by default.
 *
 * The payload is never trusted on its own — verifyWebhookSignature asks
 * PayPal's own verification endpoint before anything here is read for real
 * (src/lib/payments/paypal.ts's doc comment explains why).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (rawBody.length > 200_000) return NextResponse.json({ ok: false }, { status: 413 });

  const verified = await verifyWebhookSignature(req.headers, rawBody);
  if (!verified.ok) {
    console.error("paypal webhook verification failed", verified.code, verified.detail);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let event: unknown;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const e = event as { event_type?: unknown; resource?: Record<string, unknown> };

  const resource = e.resource ?? {};
  const facts = captureFacts(resource);
  const orderId = facts.customId || (typeof resource.invoice_id === "string" && resource.invoice_id) || null;

  // Money taken back after the fact: flag the order and tell the owner before it ships.
  if (e.event_type === "PAYMENT.CAPTURE.REFUNDED" || e.event_type === "PAYMENT.CAPTURE.REVERSED" || e.event_type === "PAYMENT.CAPTURE.DENIED") {
    if (orderId) await flagReversedPayment(orderId, String(e.event_type).replace("PAYMENT.CAPTURE.", "").toLowerCase(), facts.id);
    return NextResponse.json({ ok: true });
  }

  // Only a completed capture means money moved. Everything else (order approved, order created, ...)
  // is acknowledged and ignored.
  if (e.event_type !== "PAYMENT.CAPTURE.COMPLETED") return NextResponse.json({ ok: true, ignored: true });
  if (!facts.id || !orderId) return NextResponse.json({ ok: false }, { status: 400 });

  const existing = await getOrderForSettlement(orderId);
  if (!existing) return NextResponse.json({ ok: false }, { status: 404 });
  if (!captureMatchesOrder(facts, orderId, existing.totalAgorot)) {
    console.error("paypal webhook: capture doesn't match the order", orderId, facts.status, facts.currency, facts.amountAgorot, existing.totalAgorot);
    return NextResponse.json({ ok: true, ignored: "mismatch" }); // acknowledged, never settled
  }

  await settleOnlinePayment({
    orderId,
    provider: "paypal",
    providerOrderId: null,
    captureId: facts.id,
    amountAgorot: existing.totalAgorot,
    raw: resource,
  });
  return NextResponse.json({ ok: true });
}
