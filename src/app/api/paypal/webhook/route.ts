import { NextResponse, type NextRequest } from "next/server";
import { findOrder, settleOrderPaid } from "@/lib/order-service";
import { isHandledWebhookEvent, readWebhookOrderRef } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/paypal";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/paypal/webhook — PayPal's own word that money moved.
 *
 * This is the authoritative path to `paid`. The browser's capture call is the
 * fast path; this one still lands when the customer closed the tab, lost
 * signal, or the capture response was eaten in flight.
 *
 * Non-negotiables encoded here:
 *   - the RAW body is read FIRST and verified with PayPal's own
 *     verify-webhook-signature API before a single field is believed. An
 *     unsigned or badly signed POST claiming a completed payment gets a 400
 *     and changes nothing;
 *   - the route is gated on NOTHING else. No consent check, no rate limiter.
 *     Dropping a genuine capture event to protect a counter would lose an
 *     order that has already been paid for;
 *   - unknown event types and repeat deliveries return 200. A 4xx/5xx makes
 *     PayPal retry, and there is nothing here worth retrying.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Raw first: the signature is over these exact bytes, so the body must be
  // read as text and never re-serialised from a parsed object.
  const rawBody = await request.text();

  const verified = await verifyWebhookSignature(request.headers, rawBody);
  if (!verified.ok) {
    console.error(`[webhook] signature not verified (${verified.code}): ${verified.detail}`);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: { event_type?: unknown; resource?: unknown };
  try {
    event = JSON.parse(rawBody) as { event_type?: unknown; resource?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!isHandledWebhookEvent(event.event_type)) {
    // Acknowledged and ignored — refunds, disputes, approval chatter.
    return NextResponse.json({ ok: true, handled: false });
  }

  const ref = readWebhookOrderRef(event.resource);

  const db = getSupabaseAdmin();
  if (!db) {
    // No database configured: nothing to record. Do NOT ask PayPal to retry —
    // a retry would find the same missing configuration.
    console.error("[webhook] capture event arrived with no Supabase configured");
    return NextResponse.json({ ok: true, handled: false });
  }

  const order = await findOrder(db, {
    orderId: ref.orderId,
    paypalOrderId: ref.paypalOrderId,
  });
  if (!order) {
    console.warn("[webhook] capture event did not match any order row");
    return NextResponse.json({ ok: true, handled: false });
  }

  // Provider-scoped: an order created for PayPlus is never settled by a
  // PayPal event, whatever the event claims. settleOrderPaid rejects it.
  const settled = await settleOrderPaid(db, order, ref.captureId, "paypal");

  if (settled.decision.action === "reject") {
    console.error(`[webhook] refused to settle ${order.id}: ${settled.decision.reason}`);
  }

  // Always 200 from here: promoted, already-paid duplicate, or a resource we
  // could not act on — none of them is worth a redelivery.
  return NextResponse.json({ ok: true, handled: settled.promoted });
}
