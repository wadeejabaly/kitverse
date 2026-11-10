import { NextResponse, type NextRequest } from "next/server";
import { readOrderToken } from "@/lib/orders/link";
import { cancelManualOrder } from "@/lib/orders/manual-pay";

/** The customer drops an unpaid personal-Bit / PayPal.Me order from its pay page (only before reporting a payment). */
export async function POST(req: NextRequest) {
  let body: { t?: unknown } = {};
  try { body = (await req.json()) as { t?: unknown }; } catch { /* handled below */ }
  const orderId = typeof body.t === "string" ? readOrderToken(body.t) : null;
  if (!orderId) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const r = await cancelManualOrder(orderId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ code: "closed" }, { status: 409 });
}
