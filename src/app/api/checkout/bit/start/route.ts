import { NextResponse, type NextRequest } from "next/server";
import { CreateOrderRequestSchema, orderReference, type CheckoutErrorBody } from "@/lib/checkout";
import { createPendingOnlineOrder, recordPendingPayment } from "@/lib/orders/online";
import { generatePaymentLink, isPayPlusConfigured } from "@/lib/payments/payplus";
import { env } from "@/lib/env";

/**
 * Website checkout, Bit: writes a priced order that is not yet paid (see
 * src/lib/orders/online.ts) and asks PayPlus to mint a hosted payment page
 * for that total. Whichever charge methods are enabled on the real
 * PAYPLUS_PAYMENT_PAGE_UID is what that hosted page actually offers — this
 * call only ever asks for "bit" at this layer (src/lib/payments/payplus.ts's
 * doc comment). Nothing is settled here — see /api/checkout/bit/return (the
 * buyer's own redirect back) and /api/payplus/webhook (PayPlus's own
 * notification) for the only two places that can mark this paid, and why
 * neither trusts this redirect on its own.
 */
export async function POST(req: NextRequest) {
  if (!isPayPlusConfigured()) return NextResponse.json<CheckoutErrorBody>({ code: "payments_unconfigured" }, { status: 400 });

  const raw = await req.text();
  if (raw.length > 50_000) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 }); }
  const parsed = CreateOrderRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 });

  const r = await createPendingOnlineOrder(parsed.data, "bit");
  if (!r.ok) {
    if (r.code === "server_error") console.error("bit order (prepare) failed", r.detail);
    return NextResponse.json<CheckoutErrorBody>({ code: r.code }, { status: r.code === "server_error" ? 500 : 400 });
  }

  const site = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const back = (outcome: "success" | "failed" | "cancelled") =>
    `${site}/api/checkout/bit/return?order=${r.order.id}&t=${encodeURIComponent(r.token)}&r=${outcome}`;

  const link = await generatePaymentLink({
    orderId: r.order.id,
    amountAgorot: r.totalAgorot,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    items: [{ name: `KitVerse Jerseys — order #${orderReference(r.order.id)}`, quantity: 1, price: r.totalAgorot / 100 }],
    successUrl: back("success"),
    failureUrl: back("failed"),
    cancelUrl: back("cancelled"),
    callbackUrl: `${site}/api/payplus/webhook`,
  });
  if (!link.ok) {
    console.error("payplus generatePaymentLink failed", link.code, link.detail);
    return NextResponse.json<CheckoutErrorBody>({ code: "payplus_failed" }, { status: 502 });
  }

  await recordPendingPayment(r.order.id, "bit", link.value.pageRequestUid, r.totalAgorot);
  return NextResponse.json({ redirectUrl: link.value.paymentPageLink });
}
