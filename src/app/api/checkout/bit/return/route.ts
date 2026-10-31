import { NextResponse, type NextRequest } from "next/server";
import { fetchPaymentFacts } from "@/lib/payments/payplus";
import { decidePayPlusVerdict, PAYPLUS_CURRENCY } from "@/lib/payments/payplus-protocol";
import { getOrderForSettlement, getPendingProviderOrderId, settleOnlinePayment } from "@/lib/orders/online";
import { readOrderToken } from "@/lib/orders/link";
import { orderReference } from "@/lib/checkout";
import { toIls } from "@/lib/pricing/engine";
import { env } from "@/lib/env";

/**
 * Where PayPlus sends the buyer's browser back — success, failure, or
 * cancel, all three to this one route (/api/checkout/bit/start sets `r`
 * accordingly). THE VERDICT RULE applies here exactly as it does to the
 * webhook (src/lib/payments/payplus-protocol.ts): this redirect, including
 * r=success, is a claim, not a fact. Only decidePayPlusVerdict() on facts
 * fetched FROM PayPlus — never trusted from this query string — can mark the
 * order paid. r=cancelled skips that round trip: a buyer who backed out
 * before any charge attempt has nothing for PayPlus to report.
 */
export async function GET(req: NextRequest) {
  const site = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { searchParams } = req.nextUrl;
  const orderId = searchParams.get("order") ?? "";
  const token = searchParams.get("t") ?? "";
  const outcome = searchParams.get("r");

  if (!orderId || readOrderToken(token) !== orderId) {
    return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });
  }
  if (outcome === "cancelled") {
    return NextResponse.redirect(`${site}/checkout?pay=cancelled`, { status: 303 });
  }

  const existing = await getOrderForSettlement(orderId);
  if (!existing) return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });

  const pageRequestUid = await getPendingProviderOrderId(orderId, "bit");
  const facts = pageRequestUid ? await fetchPaymentFacts({ pageRequestUid, transactionUid: null }) : null;
  const verdict = decidePayPlusVerdict(facts && facts.ok ? facts.value : null, { amount: toIls(existing.totalAgorot), currency: PAYPLUS_CURRENCY });

  if (!verdict.paid) {
    if (facts && !facts.ok) console.error("payplus fetchPaymentFacts failed", facts.code, facts.detail);
    else console.error("payplus verdict: not paid", verdict.reason, verdict.detail);
    return NextResponse.redirect(`${site}/checkout?pay=failed`, { status: 303 });
  }

  await settleOnlinePayment({
    orderId,
    provider: "bit",
    providerOrderId: pageRequestUid,
    captureId: verdict.transactionUid,
    amountAgorot: existing.totalAgorot,
    raw: facts && facts.ok ? facts.value : null,
  });

  return NextResponse.redirect(`${site}/checkout/thank-you?ref=${orderReference(orderId)}&t=${encodeURIComponent(token)}`, { status: 303 });
}
