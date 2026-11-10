import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CreateOrderRequestSchema, type CheckoutErrorBody } from "@/lib/checkout";
import { startManualOrder } from "@/lib/orders/manual-pay";
import { MANUAL_METHODS } from "@/lib/manual-pay-core";

/**
 * Website checkout, personal Bit / PayPal.Me: writes the order UNPAID (see
 * src/lib/orders/manual-pay.ts) and returns the signed token of its pay page.
 * `attemptId` is minted once per checkout in the browser: the same id twice
 * returns the same order instead of a second one.
 */
const Body = CreateOrderRequestSchema.extend({
  method: z.enum(MANUAL_METHODS),
  attemptId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 50_000) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 });
  const { method, attemptId, ...order } = parsed.data;

  const r = await startManualOrder(order, method, attemptId);
  if (!r.ok) {
    if (r.code === "server_error") console.error("manual-payment order failed", "detail" in r ? r.detail : "");
    const reason = r.code === "invalid_discount_code" && "detail" in r && r.detail ? { reason: r.detail } : {};
    return NextResponse.json<CheckoutErrorBody>({ code: r.code, ...reason }, { status: r.code === "server_error" ? 500 : 400 });
  }
  return NextResponse.json({ token: r.token, reference: r.reference });
}
