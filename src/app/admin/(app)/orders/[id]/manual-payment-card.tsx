"use client";

import { useActionState, useState } from "react";
import { Check, ExternalLink, RotateCcw, X } from "lucide-react";
import { confirmManualPayment, rejectManualPaymentAction, type ManualPayActionState } from "../../../orders-actions";
import { Badge, SectionTitle, Card, button, input, cx } from "../../../ui";

export type ManualPaymentInfo = {
  orderId: string;
  method: "bit_personal" | "paypal_me";
  expected: string; // "300" / "299.90"
  note: string; // KV1042
  state: "awaiting_payment" | "awaiting_verification" | "needs_resubmit" | "paid" | "failed" | "cancelled";
  reference: string | null;
  proofUrl: string | null;
  reportedAt: string | null;
  received: string | null;
  verifiedAt: string | null;
  reviewNote: string | null;
  payee: string | null; // the Bit number / PayPal.Me name it was sent to
};

/**
 * Personal Bit / PayPal.Me verification (owner requests 2026-11-10). Nothing
 * here trusts the customer: the owner opens their own Bit / PayPal app, finds
 * the transfer, and types the amount that actually arrived.
 */
export function ManualPaymentCard({ p }: { p: ManualPaymentInfo }) {
  const [confirmState, confirmAction, confirming] = useActionState<ManualPayActionState, FormData>(confirmManualPayment, null);
  const [rejectState, rejectAction, rejecting] = useActionState<ManualPayActionState, FormData>(rejectManualPaymentAction, null);
  const [rejectMode, setRejectMode] = useState<"retry" | "cancel" | null>(null);
  const label = p.method === "bit_personal" ? "Bit" : "PayPal.Me";
  const open = p.state === "awaiting_payment" || p.state === "awaiting_verification" || p.state === "needs_resubmit";
  const tone = p.state === "paid" ? "green" : p.state === "failed" || p.state === "cancelled" ? "red" : "amber";
  const stateLabel = {
    awaiting_payment: "Customer hasn't reported paying yet",
    awaiting_verification: `Awaiting ${label} payment verification`,
    needs_resubmit: "Asked the customer to check again",
    paid: "Paid - confirmed by you",
    failed: "Payment failed - order cancelled",
    cancelled: "Cancelled",
  }[p.state];

  return (
    <Card>
      <SectionTitle>{label} payment</SectionTitle>
      <div className="mb-3"><Badge tone={tone}>{stateLabel}</Badge></div>
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Expected</dt><dd className="font-semibold tabular-nums">₪{p.expected}</dd>
        <dt className="text-muted">Note to look for</dt><dd className="font-mono">{p.note}</dd>
        {p.payee ? <><dt className="text-muted">Paid to</dt><dd className="tabular-nums">{p.payee}</dd></> : null}
        {p.reportedAt ? <><dt className="text-muted">Customer reported</dt><dd>{p.reportedAt}</dd></> : null}
        {p.reference ? <><dt className="text-muted">Their reference</dt><dd className="break-all font-mono" dir="auto">{p.reference}</dd></> : null}
        {p.received ? <><dt className="text-muted">Received</dt><dd className="tabular-nums">₪{p.received}{p.verifiedAt ? ` · ${p.verifiedAt}` : ""}</dd></> : null}
        {p.reviewNote ? <><dt className="text-muted">Note</dt><dd dir="auto">{p.reviewNote}</dd></> : null}
      </dl>
      {p.proofUrl ? (
        <a href={p.proofUrl} target="_blank" rel="noreferrer" className="mb-4 block overflow-hidden rounded-xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
          <img src={p.proofUrl} alt="Customer's payment screenshot" className="max-h-72 w-full bg-paper object-contain" />
          <span className="flex items-center gap-1 px-3 py-2 text-xs text-muted"><ExternalLink className="h-3.5 w-3.5" /> Open screenshot (link valid 10 minutes)</span>
        </a>
      ) : null}

      {open ? (
        <>
          <p className="mb-3 text-sm text-muted">
            Open your {label} app, find ₪{p.expected}{p.method === "bit_personal" ? "" : " (ILS)"} with note <span className="font-mono">{p.note}</span>, and type what actually arrived. The customer coming back from {label} or sending a screenshot is not proof on its own.
          </p>
          <form action={confirmAction} className="flex flex-col gap-2.5 text-sm">
            <input type="hidden" name="orderId" value={p.orderId} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Amount received (₪)
              <input name="received" inputMode="decimal" required placeholder={p.expected} className={`${input} w-36 tabular-nums`} />
            </label>
            {confirmState?.mismatch ? (
              <div className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm">
                <p className="font-medium">That is ₪{confirmState.mismatch.difference} {confirmState.mismatch.kind === "short" ? "LESS" : "MORE"} than the order total (₪{p.expected}).</p>
                <p className="mt-1 text-xs text-muted">{confirmState.mismatch.kind === "short" ? "Ask the customer for the rest, or accept it anyway." : "Refund the difference from your app, or accept it anyway."}</p>
                <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="acceptMismatch" className="h-4 w-4 accent-[var(--pitch)]" /> Accept this amount and mark the order paid</label>
              </div>
            ) : null}
            <input name="note" placeholder="Note (optional)" className={input} />
            <button disabled={confirming} className={`${button.primary} self-start`}><Check className="h-4 w-4" /> {confirming ? "Saving..." : "Confirm payment received"}</button>
            {confirmState?.error ? <p className="text-sm text-red">{confirmState.error}</p> : null}
          </form>

          <div className="mt-4 border-t border-line pt-3">
            {rejectMode ? (
              <form action={rejectAction} className="flex flex-col gap-2 text-sm">
                <input type="hidden" name="orderId" value={p.orderId} />
                <input type="hidden" name="mode" value={rejectMode} />
                <input name="note" placeholder={rejectMode === "retry" ? "What the customer should check (shown to them)" : "Reason (optional)"} className={input} dir="auto" />
                <div className="flex flex-wrap gap-2">
                  <button disabled={rejecting} className={rejectMode === "cancel" ? button.danger : button.ghost}>
                    {rejectMode === "retry" ? <><RotateCcw className="h-4 w-4" /> Ask customer to check again</> : <><X className="h-4 w-4" /> Not received - cancel order</>}
                  </button>
                  <button type="button" className={button.subtle} onClick={() => setRejectMode(null)}>Back</button>
                </div>
                {rejectState?.error ? <p className="text-sm text-red">{rejectState.error}</p> : null}
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button.ghost} onClick={() => setRejectMode("retry")}><RotateCcw className="h-4 w-4" /> Can&apos;t find it yet</button>
                <button type="button" className={cx(button.ghost, "text-red")} onClick={() => setRejectMode("cancel")}><X className="h-4 w-4" /> Not received</button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </Card>
  );
}
