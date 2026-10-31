import { NextResponse, type NextRequest } from "next/server";
import { CreateOrderRequestSchema, type CheckoutErrorBody } from "@/lib/checkout";
import { createPendingOnlineOrder, recordPendingPayment } from "@/lib/orders/online";
import { createOrder as createPayPalOrder, isPayPalConfigured } from "@/lib/payments/paypal";
import { env } from "@/lib/env";

/**
 * Website checkout, PayPal: writes a priced order that is not yet paid (see
 * src/lib/orders/online.ts), asks PayPal to mint an order for that total,
 * and hands the browser the approval URL to redirect to. Nothing is settled
 * here — see /api/checkout/paypal/return (the buyer's own redirect back)
 * and /api/paypal/webhook (PayPal's own notification) for the only two
 * places that can mark this paid.
 */
export async function POST(req: NextRequest) {
  if (!isPayPalConfigured()) return NextResponse.json<CheckoutErrorBody>({ code: "payments_unconfigured" }, { status: 400 });

  const raw = await req.text();
  if (raw.length > 50_000) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 }); }
  const parsed = CreateOrderRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 });

  const r = await createPendingOnlineOrder(parsed.data, "paypal");
  if (!r.ok) {
    if (r.code === "server_error") console.error("paypal order (prepare) failed", r.detail);
    return NextResponse.json<CheckoutErrorBody>({ code: r.code }, { status: r.code === "server_error" ? 500 : 400 });
  }

  const site = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  // PayPal appends its own ?token=&PayerID= to whatever query string is
  // already here — order/t identify OUR row so /return doesn't have to
  // trust anything PayPal adds beyond the capture call itself.
  const returnUrl = `${site}/api/checkout/paypal/return?order=${r.order.id}&t=${encodeURIComponent(r.token)}`;
  const cancelUrl = `${site}/checkout?pay=cancelled`;

  const created = await createPayPalOrder(r.totalAgorot, r.order.id, returnUrl, cancelUrl);
  if (!created.ok) {
    console.error("paypal createOrder failed", created.code, created.detail);
    return NextResponse.json<CheckoutErrorBody>({ code: "paypal_failed" }, { status: 502 });
  }

  await recordPendingPayment(r.order.id, "paypal", created.value.paypalOrderId, r.totalAgorot);
  return NextResponse.json({ approveUrl: created.value.approveUrl });
}
