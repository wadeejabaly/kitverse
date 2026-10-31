import { NextResponse, type NextRequest } from "next/server";
import { fetchPaymentFacts, getPayPlusSecretKey } from "@/lib/payments/payplus";
import { decidePayPlusVerdict, readPayPlusFacts, verifyWebhookRequest, PAYPLUS_CURRENCY } from "@/lib/payments/payplus-protocol";
import { getOrderForSettlement, settleOnlinePayment } from "@/lib/orders/online";
import { toIls } from "@/lib/pricing/engine";

/**
 * PayPlus's own notification — the second, independent path to settlement
 * (the buyer's own redirect, /api/checkout/bit/return, is the other). Exists
 * for the buyer who pays and closes the tab before the redirect completes.
 *
 * A verified callback (User-Agent + HMAC, both checked by
 * verifyWebhookRequest) is still only a POINTER to which order to ask about
 * — THE VERDICT RULE (src/lib/payments/payplus-protocol.ts) means the actual
 * verdict is always re-fetched independently here, never read off the
 * callback body.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (rawBody.length > 200_000) return NextResponse.json({ ok: false }, { status: 413 });

  const secretKey = getPayPlusSecretKey();
  if (!secretKey) return NextResponse.json({ ok: false }, { status: 400 });

  const auth = verifyWebhookRequest({ userAgent: req.headers.get("user-agent"), hashHeader: req.headers.get("hash"), rawBody, secretKey });
  if (!auth.ok) {
    console.error("payplus webhook auth failed", auth.reason);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const pointer = readPayPlusFacts(payload);
  const orderId = pointer.orderId;
  if (!orderId) return NextResponse.json({ ok: false }, { status: 400 });

  const existing = await getOrderForSettlement(orderId);
  if (!existing) return NextResponse.json({ ok: false }, { status: 404 });

  const facts = await fetchPaymentFacts({ pageRequestUid: pointer.pageRequestUid, transactionUid: pointer.transactionUid });
  const verdict = decidePayPlusVerdict(facts.ok ? facts.value : null, { amount: toIls(existing.totalAgorot), currency: PAYPLUS_CURRENCY });
  if (!verdict.paid) {
    if (!facts.ok) console.error("payplus webhook fetchPaymentFacts failed", facts.code, facts.detail);
    else console.error("payplus webhook verdict: not paid", verdict.reason, verdict.detail);
    return NextResponse.json({ ok: true, settled: false });
  }

  await settleOnlinePayment({
    orderId,
    provider: "bit",
    providerOrderId: pointer.pageRequestUid,
    captureId: verdict.transactionUid,
    amountAgorot: existing.totalAgorot,
    raw: facts.ok ? facts.value : null,
  });
  return NextResponse.json({ ok: true, settled: true });
}
