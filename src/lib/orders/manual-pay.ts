import "server-only";
import { randomUUID } from "node:crypto";
import { db, must } from "../db";
import { notify } from "../notify";
import { recordDiscountCodeUse } from "../discounts";
import { orderReference, type CreateOrderRequest } from "../checkout";
import { orderToken } from "./link";
import { prepareOrder, type PrepareFailure } from "./web";
import {
  checkReceivedAmount,
  formatBitPhone,
  formatIls,
  manualPayState,
  normalizeBitPhone,
  normalizePayPalMeUsername,
  paypalMeUrl,
  transferNote,
  type ManualMethod,
  type ManualPayState,
} from "../manual-pay-core";

/**
 * Website checkout on the two hand-verified rails (owner requests
 * 2026-11-10): personal Bit and PayPal.Me. See src/lib/manual-pay-core.ts for
 * what those rails can and cannot do.
 *
 * Life of an order here:
 *   1. startManualOrder   - the order is written exactly like every other
 *      website order (prepareOrder) but UNPAID, status "quoted", with ONE
 *      pending payments row keyed by the browser's attempt id (a double click
 *      or a retry returns the same order, never a second one).
 *   2. reportManualPayment - the customer says "I paid" with a reference
 *      and/or a screenshot. Accepted once. The order moves to
 *      "awaiting_payment_verification" and the owner is alerted. STILL UNPAID.
 *   3. verifyManualPayment (owner, admin) - the owner checked their Bit/PayPal
 *      app and enters the amount that actually arrived. A different amount is
 *      refused unless the owner explicitly accepts it. Only this marks the
 *      order paid, then it joins the normal "waiting for your OK" queue.
 *      rejectManualPayment (owner) - "not found yet, ask the customer again"
 *      or "not received, cancel the order" (payment failed).
 *      cancelManualOrder (customer) - before reporting, the customer can drop
 *      the order (payment cancelled).
 */

const PROOF_BUCKET = "payment-proofs";

export type ManualPayConfig = {
  bit: { enabled: boolean; phone: string | null; name: string | null };
  paypalMe: { enabled: boolean; username: string | null };
};

/**
 * Owner-editable in admin Settings (bot_settings rows "bit_personal" and
 * "paypal_me"); BIT_PERSONAL_PHONE / PAYPAL_ME_USERNAME are only a fallback
 * for an environment where the row was never saved. Neither value is a
 * secret (customers have to see them to pay), but they are only ever sent to
 * the browser on the pay page of an order that already exists.
 */
export async function getManualPayConfig(): Promise<ManualPayConfig> {
  const rows = ((await db().from("bot_settings").select("key,value").in("key", ["bit_personal", "paypal_me"])).data ?? []) as { key: string; value: Record<string, unknown> }[];
  const row = (k: string) => rows.find((r) => r.key === k)?.value;
  const bitRow = row("bit_personal");
  const ppRow = row("paypal_me");
  const phone = normalizeBitPhone(bitRow ? bitRow.phone : process.env.BIT_PERSONAL_PHONE);
  const username = normalizePayPalMeUsername(ppRow ? ppRow.username : process.env.PAYPAL_ME_USERNAME);
  const name = typeof bitRow?.name === "string" && bitRow.name.trim() ? bitRow.name.trim().slice(0, 40) : null;
  return {
    bit: { enabled: !!phone && (bitRow ? bitRow.enabled === true : true), phone, name },
    paypalMe: { enabled: !!username && (ppRow ? ppRow.enabled === true : true), username },
  };
}

export const methodEnabled = (cfg: ManualPayConfig, m: ManualMethod) => (m === "bit_personal" ? cfg.bit.enabled : cfg.paypalMe.enabled);

type PaymentRow = {
  id: string; order_id: string; provider: ManualMethod; provider_order_id: string | null; amount: number; status: string;
  customer_reference: string | null; proof_path: string | null; reported_at: string | null; received_amount: number | null;
  review_note: string | null; verified_at: string | null; created_at: string;
};

const PAYMENT_COLS = "id,order_id,provider,provider_order_id,amount,status,customer_reference,proof_path,reported_at,received_amount,review_note,verified_at,created_at";

async function paymentByAttempt(method: ManualMethod, attemptId: string) {
  const r = await db().from("payments").select(PAYMENT_COLS).eq("provider", method).eq("provider_order_id", attemptId).maybeSingle();
  if (r.error) throw new Error(`manual payment lookup: ${r.error.message}`);
  return r.data as PaymentRow | null;
}

/** The order's manual payment row (the newest one - there is normally exactly one). */
export async function manualPaymentFor(orderId: string): Promise<PaymentRow | null> {
  const r = await db().from("payments").select(PAYMENT_COLS).eq("order_id", orderId).in("provider", ["bit_personal", "paypal_me"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new Error(`manual payment for order: ${r.error.message}`);
  return r.data as PaymentRow | null;
}

export type StartManualResult = { ok: true; token: string; reference: string; number: number; reused: boolean } | PrepareFailure | { ok: false; code: "payments_unconfigured" };

export async function startManualOrder(req: CreateOrderRequest, method: ManualMethod, attemptId: string): Promise<StartManualResult> {
  const cfg = await getManualPayConfig();
  if (!methodEnabled(cfg, method)) return { ok: false, code: "payments_unconfigured" };

  // the same attempt again (double click, network retry, back-and-resubmit): the order it already made
  const again = await paymentByAttempt(method, attemptId);
  if (again) return reuse(again.order_id);

  const prepared = await prepareOrder(req, { claimCodes: false }); // a code's use is claimed once the owner confirms payment
  if (!prepared.ok) return prepared;
  const { order, q } = prepared;
  const row = must(await db().from("orders").update({ payment_method: method, total: q.total }).eq("id", order.id).select("id,number,total").single(), "price manual order") as { id: string; number: number; total: number };

  const ins = await db().from("payments").insert({ order_id: row.id, provider: method, provider_order_id: attemptId, amount: row.total, status: "pending" }).select("id");
  if (ins.error) {
    // a parallel request with the same attempt id won the race: keep its order, drop this one
    await db().from("orders").update({ status: "cancelled", notes: "duplicate checkout submission (same attempt)" }).eq("id", row.id);
    const winner = /duplicate key|payments_manual_attempt/i.test(ins.error.message) ? await paymentByAttempt(method, attemptId) : null;
    if (winner) return reuse(winner.order_id);
    return { ok: false, code: "server_error", detail: ins.error.message };
  }
  must(await db().from("order_events").insert({ order_id: row.id, from_status: "draft", to_status: "quoted", actor: "customer", note: `${method === "bit_personal" ? "Bit (personal)" : "PayPal.Me"} checkout - waiting for payment` }).select("id"), "manual order event");
  return { ok: true, token: orderToken(row.id), reference: orderReference(row.id), number: row.number, reused: false };
}

async function reuse(orderId: string): Promise<StartManualResult> {
  const o = must(await db().from("orders").select("id,number").eq("id", orderId).single(), "reused order") as { id: string; number: number };
  return { ok: true, token: orderToken(o.id), reference: orderReference(o.id), number: o.number, reused: true };
}

export type ManualPayView = {
  orderId: string;
  number: number;
  method: ManualMethod;
  totalAgorot: number;
  totalLabel: string;
  note: string;
  state: ManualPayState;
  reviewNote: string | null;
  reportedReference: string | null;
  reportedProof: boolean;
  bit: { phone: string; phoneLabel: string; name: string | null } | null;
  paypal: { url: string; username: string } | null;
  /** The method was switched off in Settings after this order was placed. */
  methodUnavailable: boolean;
};

/** Everything the customer's pay page shows, for an order they hold the signed token of. Null when it isn't a manual-payment order. */
export async function manualPayView(orderId: string): Promise<ManualPayView | null> {
  const o = (await db().from("orders").select("id,number,total,status,payment_status,payment_method").eq("id", orderId).maybeSingle()).data as
    { id: string; number: number; total: number; status: string; payment_status: string; payment_method: string | null } | null;
  if (!o || (o.payment_method !== "bit_personal" && o.payment_method !== "paypal_me")) return null;
  const method = o.payment_method;
  const p = await manualPaymentFor(o.id);
  const cfg = await getManualPayConfig();
  const state = manualPayState({ orderStatus: o.status, paymentStatus: o.payment_status, payment: p ? { status: p.status, reportedAt: p.reported_at, reviewNote: p.review_note } : null });
  const bitPhone = method === "bit_personal" ? cfg.bit.phone : null;
  const ppUser = method === "paypal_me" ? cfg.paypalMe.username : null;
  return {
    orderId: o.id,
    number: o.number,
    method,
    totalAgorot: o.total,
    totalLabel: formatIls(o.total),
    note: transferNote(o.number),
    state,
    reviewNote: p?.review_note ?? null,
    reportedReference: p?.customer_reference ?? null,
    reportedProof: !!p?.proof_path,
    bit: bitPhone ? { phone: bitPhone, phoneLabel: formatBitPhone(bitPhone), name: cfg.bit.name } : null,
    paypal: ppUser && o.total > 0 ? { url: paypalMeUrl(ppUser, o.total), username: ppUser } : null,
    methodUnavailable: !methodEnabled(cfg, method),
  };
}

export type ReportResult = { ok: true } | { ok: false; code: "not_found" | "already_reported" | "closed" | "empty" | "server_error" };

/**
 * The customer says they paid. Stored as evidence for the owner, accepted
 * once (the WHERE reported_at IS NULL guard), and it NEVER marks anything
 * paid - the order only moves to "awaiting_payment_verification".
 */
export async function reportManualPayment(orderId: string, input: { reference: string; proof?: { bytes: Uint8Array; mime: string; ext: string } }): Promise<ReportResult> {
  if (!input.reference && !input.proof) return { ok: false, code: "empty" };
  const p = await manualPaymentFor(orderId);
  if (!p) return { ok: false, code: "not_found" };
  const o = (await db().from("orders").select("id,number,total,status,payment_status,address").eq("id", orderId).single()).data as { id: string; number: number; total: number; status: string; payment_status: string; address: { full_name?: string } | null } | null;
  if (!o) return { ok: false, code: "not_found" };
  if (p.reported_at) return { ok: false, code: "already_reported" };
  if (p.status !== "pending" || o.payment_status !== "unpaid" || o.status === "cancelled") return { ok: false, code: "closed" };

  let proofPath: string | null = null;
  if (input.proof) {
    proofPath = `${orderId}/${randomUUID()}.${input.proof.ext}`;
    const up = await db().storage.from(PROOF_BUCKET).upload(proofPath, input.proof.bytes, { contentType: input.proof.mime, upsert: false });
    if (up.error) {
      console.error("payment proof upload failed", up.error.message);
      return { ok: false, code: "server_error" };
    }
  }

  const claimed = await db().from("payments")
    .update({ customer_reference: input.reference || null, proof_path: proofPath, reported_at: new Date().toISOString(), review_note: null })
    .eq("id", p.id).eq("status", "pending").is("reported_at", null).select("id");
  if (claimed.error) return { ok: false, code: "server_error" };
  if (!claimed.data?.length) {
    if (proofPath) await db().storage.from(PROOF_BUCKET).remove([proofPath]); // lost a double-submit race: keep only the first report
    return { ok: false, code: "already_reported" };
  }

  const moved = await db().from("orders").update({ status: "awaiting_payment_verification" }).eq("id", o.id).eq("payment_status", "unpaid").in("status", ["quoted"]).select("id");
  if (moved.data?.length) await db().from("order_events").insert({ order_id: o.id, from_status: "quoted", to_status: "awaiting_payment_verification", actor: "customer", note: `customer reported payment${input.reference ? ` (ref ${input.reference})` : ""}${proofPath ? " + screenshot" : ""}` });
  const label = p.provider === "bit_personal" ? "Bit" : "PayPal.Me";
  await notify({
    kind: "order.payment_reported",
    priority: "urgent",
    title: `Check ${label}: order #${o.number} - ₪${formatIls(o.total)}`,
    body: `${o.address?.full_name ?? "Customer"} says they paid${input.reference ? ` (ref ${input.reference})` : ""}. Look for ₪${formatIls(o.total)} with note ${transferNote(o.number)}, then confirm or reject.`,
    link: `/admin/orders/${o.id}`,
  });
  return { ok: true };
}

/** The customer drops an order they have not paid for yet (only before reporting a payment). */
export async function cancelManualOrder(orderId: string): Promise<{ ok: boolean }> {
  const p = await manualPaymentFor(orderId);
  if (!p || p.reported_at || p.status !== "pending") return { ok: false };
  const o = await db().from("orders").update({ status: "cancelled", notes: "customer cancelled before paying" }).eq("id", orderId).eq("payment_status", "unpaid").eq("status", "quoted").select("id");
  if (!o.data?.length) return { ok: false };
  await db().from("payments").update({ status: "cancelled" }).eq("id", p.id).eq("status", "pending");
  await db().from("order_events").insert({ order_id: orderId, from_status: "quoted", to_status: "cancelled", actor: "customer", note: "cancelled on the payment page before paying" });
  return { ok: true };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "not_pending" | "order_cancelled" | "bad_amount" | "server_error" }
  | { ok: false; code: "amount_mismatch"; kind: "short" | "over"; differenceAgorot: number };

/**
 * The owner found the money in their Bit / PayPal app. `receivedAgorot` is
 * what actually arrived; anything other than the exact total is refused
 * unless `acceptMismatch` (the owner ticked "accept this amount anyway").
 * The order's own WHERE guard (payment_status = 'unpaid') makes a double
 * click or a second admin a no-op.
 */
export async function verifyManualPayment(opts: { orderId: string; staffId: string | null; receivedAgorot: number; acceptMismatch: boolean; note?: string }): Promise<VerifyResult> {
  if (!Number.isInteger(opts.receivedAgorot) || opts.receivedAgorot <= 0) return { ok: false, code: "bad_amount" };
  const p = await manualPaymentFor(opts.orderId);
  if (!p) return { ok: false, code: "not_found" };
  const o = (await db().from("orders").select("id,number,total,status,payment_status,address").eq("id", opts.orderId).single()).data as { id: string; number: number; total: number; status: string; payment_status: string; address: { full_name?: string; town?: string } | null } | null;
  if (!o) return { ok: false, code: "not_found" };
  if (o.status === "cancelled") return { ok: false, code: "order_cancelled" };
  if (p.status !== "pending" || o.payment_status !== "unpaid") return { ok: false, code: "not_pending" };
  const check = checkReceivedAmount(o.total, opts.receivedAgorot);
  if (!check.ok && !opts.acceptMismatch) return { ok: false, code: "amount_mismatch", kind: check.kind, differenceAgorot: check.differenceAgorot };

  const updated = await db().from("orders").update({ payment_status: "paid", status: "awaiting_confirmation" })
    .eq("id", o.id).eq("payment_status", "unpaid").in("status", ["quoted", "awaiting_payment_verification"]).select("id");
  if (updated.error) return { ok: false, code: "server_error" };
  if (!updated.data?.length) return { ok: false, code: "not_pending" };

  const mismatchNote = check.ok ? null : `amount ${check.kind === "short" ? "SHORT" : "OVER"} by ₪${formatIls(check.differenceAgorot)} - accepted by owner`;
  const note = [mismatchNote, opts.note?.trim() || null].filter(Boolean).join(" · ") || null;
  must(await db().from("payments").update({
    status: "completed", received_amount: opts.receivedAgorot, verified_at: new Date().toISOString(), verified_by: opts.staffId, review_note: note,
  }).eq("id", p.id).select("id"), "complete manual payment");
  await db().from("order_events").insert({ order_id: o.id, from_status: o.status, to_status: "awaiting_confirmation", actor: "owner", actor_user: opts.staffId, note: `payment confirmed: ₪${formatIls(opts.receivedAgorot)} by ${p.provider === "bit_personal" ? "Bit" : "PayPal.Me"}${note ? ` · ${note}` : ""}` });

  // the order is paid: now its discount codes count as used (same rule as settleOnlinePayment)
  const codes = ((await db().from("adjustments").select("discount_code").eq("order_id", o.id).eq("kind", "discount_code")).data ?? []) as { discount_code: string | null }[];
  for (const c of codes) if (c.discount_code && !(await recordDiscountCodeUse(c.discount_code))) console.error("discount code used up by the time payment was confirmed", c.discount_code, o.id);
  return { ok: true };
}

/**
 * The owner could not find the money.
 *  - "retry":  the report is cleared and the customer's pay page asks them to
 *              check and send their details again (order back to "quoted").
 *  - "cancel": payment failed - the order is cancelled.
 */
export async function rejectManualPayment(opts: { orderId: string; staffId: string | null; mode: "retry" | "cancel"; note?: string }): Promise<{ ok: boolean }> {
  const p = await manualPaymentFor(opts.orderId);
  if (!p || p.status !== "pending") return { ok: false };
  const o = (await db().from("orders").select("id,status,payment_status").eq("id", opts.orderId).single()).data as { id: string; status: string; payment_status: string } | null;
  if (!o || o.payment_status !== "unpaid" || o.status === "cancelled") return { ok: false };
  const note = opts.note?.trim().slice(0, 300) || (opts.mode === "retry" ? "We couldn't find this payment yet." : "Payment not received.");
  if (opts.mode === "retry") {
    const r = await db().from("payments").update({ reported_at: null, review_note: note }).eq("id", p.id).eq("status", "pending").select("id");
    if (!r.data?.length) return { ok: false };
    await db().from("orders").update({ status: "quoted" }).eq("id", o.id).eq("status", "awaiting_payment_verification").eq("payment_status", "unpaid");
    await db().from("order_events").insert({ order_id: o.id, from_status: o.status, to_status: "quoted", actor: "owner", actor_user: opts.staffId, note: `payment not found - customer asked to check again: ${note}` });
    return { ok: true };
  }
  const r = await db().from("orders").update({ status: "cancelled", notes: `payment not received: ${note}` }).eq("id", o.id).eq("payment_status", "unpaid").neq("status", "cancelled").select("id");
  if (!r.data?.length) return { ok: false };
  await db().from("payments").update({ status: "failed", review_note: note }).eq("id", p.id).eq("status", "pending");
  await db().from("order_events").insert({ order_id: o.id, from_status: o.status, to_status: "cancelled", actor: "owner", actor_user: opts.staffId, note: `payment failed: ${note}` });
  return { ok: true };
}

/** A short-lived link for the owner to view the customer's screenshot (the bucket is private). */
export async function proofUrl(path: string): Promise<string | null> {
  const r = await db().storage.from(PROOF_BUCKET).createSignedUrl(path, 60 * 10);
  return r.data?.signedUrl ?? null;
}
