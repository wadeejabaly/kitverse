import { NextResponse, type NextRequest } from "next/server";
import {
  findOrder,
  markOrderFailed,
  settleOrderPaid,
} from "@/lib/order-service";
import {
  PAYPLUS_CURRENCY,
  decidePayPlusVerdict,
  readPayPlusFacts,
  verifyWebhookRequest,
} from "@/lib/payplus-protocol";
import { fetchPaymentFacts, getPayPlusSecretKey } from "@/lib/payplus";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/payplus/webhook — PayPlus's own word that a card was charged.
 *
 * This is the ONLY path to `paid` for a card order. The buyer's browser comes
 * back from the hosted page to a thank-you screen that reports what the
 * database says and nothing more; it cannot settle anything, because a
 * redirect the buyer's browser followed is not evidence that money moved.
 *
 * Non-negotiables encoded here:
 *   - the RAW body is read FIRST, and the request is authenticated by BOTH
 *     the documented User-Agent and an HMAC-SHA256 of those exact bytes,
 *     compared timing-safely against the `hash` header;
 *   - a verified callback is still only a POINTER. It says which order to ask
 *     about; what happened is then read back from PayPlus directly
 *     (PaymentPages/ipn / Transactions/View). The verdict is
 *     status_code === "000" as a STRING and nothing else — PayPlus answers a
 *     DECLINE with HTTP 200 and an envelope whose `status` reads "success";
 *   - the route is gated on NOTHING else. No consent check, no rate limiter.
 *     Dropping a genuine settlement to protect a counter would lose an order
 *     that has already been paid for;
 *   - unknown orders and repeat deliveries return 200. A 4xx makes PayPlus
 *     retry, and there is nothing there worth retrying.
 */

export const dynamic = "force-dynamic";

/** Acknowledge without acting. Never makes PayPlus redeliver. */
function acknowledge(handled: boolean) {
  return NextResponse.json({ ok: true, handled });
}

export async function POST(request: NextRequest) {
  // Raw first: the signature is over these exact bytes, so the body must be
  // read as text and never re-serialised from a parsed object.
  const rawBody = await request.text();

  const secretKey = getPayPlusSecretKey();
  if (!secretKey) {
    // Nothing can be verified without the key, and an unverified callback is
    // not going to be believed. Do NOT ask for a retry: a redelivery would
    // find the same missing configuration.
    console.error("[payplus] callback arrived with no PAYPLUS_SECRET_KEY configured");
    return acknowledge(false);
  }

  const authenticated = verifyWebhookRequest({
    userAgent: request.headers.get("user-agent"),
    hashHeader: request.headers.get("hash"),
    rawBody,
    secretKey,
  });
  if (!authenticated.ok) {
    console.error(`[payplus] callback rejected: ${authenticated.reason}`);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Pointers only. Nothing read here is treated as a statement about money.
  const claimed = readPayPlusFacts(payload);

  const db = getSupabaseAdmin();
  if (!db) {
    console.error("[payplus] callback arrived with no Supabase configured");
    return acknowledge(false);
  }

  const order = await findOrder(db, {
    orderId: claimed.orderId,
    payplusPageRequestUid: claimed.pageRequestUid,
  });
  if (!order) {
    console.warn("[payplus] callback did not match any order row");
    return acknowledge(false);
  }

  // Settled already — by an earlier delivery of this same callback. Answer
  // without spending an API call on a question already decided.
  if (order.status === "paid") return acknowledge(false);

  const facts = await fetchPaymentFacts({
    pageRequestUid: order.payplus_page_request_uid,
    transactionUid: claimed.transactionUid,
  });

  if (!facts.ok) {
    // We could not ASK. That is a verification failure, not a decline: the
    // order stays pending and PayPlus is invited to try again.
    console.error(
      `[payplus] could not verify ${order.id} (${facts.code}): ${facts.detail}`,
    );
    return NextResponse.json({ error: "verification unavailable" }, { status: 400 });
  }

  const expectedAmount = Number(order.total_ils ?? 0);
  const settlement = decidePayPlusVerdict(facts.value, {
    amount: expectedAmount,
    currency: PAYPLUS_CURRENCY,
  });

  if (!settlement.paid) {
    if (settlement.reason === "not-approved") {
      // A definitive decline (send_failure_callback brings these here). Close
      // the pending row so it is not mistaken for an order awaiting payment.
      console.warn(`[payplus] ${order.id} not approved: ${settlement.detail}`);
      await markOrderFailed(db, order.id);
      return acknowledge(false);
    }

    // An approved payment that does not match the order we priced. Do NOT
    // mark it paid and do NOT mark it failed — money may have moved. Shout,
    // and let it show up as a failed delivery in the PayPlus dashboard where
    // the owner will see it.
    console.error(
      `[payplus] REFUSING to settle ${order.id} — ${settlement.reason}: ${settlement.detail}`,
    );
    return NextResponse.json({ error: "verification failed" }, { status: 400 });
  }

  const settled = await settleOrderPaid(
    db,
    order,
    settlement.transactionUid,
    "payplus",
  );

  if (settled.decision.action === "reject") {
    console.error(`[payplus] refused to settle ${order.id}: ${settled.decision.reason}`);
  }

  // 200 from here whatever happened: promoted, duplicate, or a row we could
  // not act on. None of them is worth a redelivery.
  return acknowledge(settled.promoted);
}
