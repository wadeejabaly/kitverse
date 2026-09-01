import { NextResponse, type NextRequest } from "next/server";
import {
  CaptureOrderRequestSchema,
  orderReference,
  type CheckoutErrorCode,
} from "@/lib/checkout";
import { findOrder, markOrderFailed, settleOrderPaid } from "@/lib/order-service";
import { captureOrder, isPayPalConfigured } from "@/lib/paypal";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/checkout/capture-order — called from the buttons' onApprove.
 *
 * Idempotent by construction. An order already `paid` returns success without
 * capturing again (PayPal would refuse a second capture anyway, and the
 * customer must not see an error for a payment that worked). The actual
 * pending→paid write is a guarded UPDATE in order-service.ts; the owner's
 * email fires only for the call that won it.
 *
 * This route is never the only path to `paid`: the webhook reaches the same
 * settlement independently, so a customer who closes the tab mid-capture
 * still ends up with a paid order.
 */

export const dynamic = "force-dynamic";

/** Looser than create-order: a legitimate retry after a network blip is normal. */
const LIMIT = { capacity: 10, refillPerSecond: 1 / 3 };

function errorResponse(code: CheckoutErrorCode, status: number) {
  return NextResponse.json({ code }, { status });
}

export async function POST(request: NextRequest) {
  const verdict = rateLimit(clientIp(request.headers), LIMIT);
  if (!verdict.allowed) return errorResponse("rate_limited", 429);

  const json = await request.json().catch(() => null);
  const parsed = CaptureOrderRequestSchema.safeParse(json);
  if (!parsed.success) return errorResponse("invalid_request", 400);
  const { paypalOrderId } = parsed.data;

  const db = getSupabaseAdmin();
  if (!db || !isPayPalConfigured()) return errorResponse("payments_unconfigured", 503);

  const order = await findOrder(db, { paypalOrderId });
  if (!order) return errorResponse("order_not_found", 404);

  // Already settled — by the webhook, or by an earlier delivery of this same
  // call. Report the success that already happened.
  if (order.status === "paid") {
    return NextResponse.json({
      status: "paid",
      reference: orderReference(order.id),
    });
  }
  if (order.status !== "pending") return errorResponse("capture_failed", 409);

  const capture = await captureOrder(paypalOrderId);
  if (!capture.ok) {
    console.error(`[checkout] capture failed (${capture.code}): ${capture.detail}`);
    await markOrderFailed(db, order.id);
    return errorResponse("capture_failed", 502);
  }

  if (capture.value.status !== "COMPLETED") {
    console.error(
      `[checkout] capture for ${order.id} returned ${capture.value.status}, not COMPLETED`,
    );
    await markOrderFailed(db, order.id);
    return errorResponse("capture_failed", 402);
  }

  const settled = await settleOrderPaid(db, order, capture.value.captureId);
  if (settled.decision.action === "reject") {
    console.error(
      `[checkout] refusing to settle ${order.id}: ${settled.decision.reason}`,
    );
    return errorResponse("capture_failed", 502);
  }

  // `promoted: false` here means the webhook got there first — still a paid
  // order, still a success for the customer.
  return NextResponse.json({
    status: "paid",
    reference: orderReference(order.id),
  });
}
