import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare, Phone, MapPin, ExternalLink, Check, X } from "lucide-react";
import { db } from "@/lib/db";
import { STATUS_MESSAGE, batchLines } from "@/lib/orders/admin";
import { orderToken } from "@/lib/orders/link";
import { PATCHES, type PatchId } from "@/lib/orders/rules";
import { approveWebOrder, changeOrderStatus, declineWebOrder } from "../../../orders-actions";
import { PageHeader, Card, Badge, SectionTitle, button, input, ORDER_STATUS, ilTime, payLabel } from "../../../ui";
import { CancelOrderButton } from "./cancel-order-button";
import { CancelInventoryPrompt } from "./cancel-inventory-prompt";
import { ManualPaymentCard, type ManualPaymentInfo } from "./manual-payment-card";
import { getManualPayConfig, manualPaymentFor, proofUrl } from "@/lib/orders/manual-pay";
import { formatBitPhone, formatIls, manualPayState, transferNote } from "@/lib/manual-pay-core";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const o = (await db().from("orders").select("*").eq("id", id).maybeSingle()).data as
    { id: string; number: number; status: string; source: string; total: number; conversation_id: string | null; payment_method: string | null; payment_status: string | null; address: Record<string, string | null> | null; quote: { summaryAr?: string } | null; returned_to_inventory_at: string | null } | null;
  if (!o) notFound();
  const lines = await batchLines([o.id]);
  const pids = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];
  const stock = pids.length
    ? ((await db().from("inventory_items").select("product_id,audience,version,sleeve,size,qty,print_name,print_number,patches").in("product_id", pids)).data ?? []) as
      { product_id: string; audience: string; version: string; sleeve: string; size: string; qty: number; print_name: string; print_number: string; patches: string[] }[]
    : [];
  // l.version/l.sleeve are already the display-cased strings batchLines() maps to ("Player"/"Fan",
  // "Long"/"Short") - undo that here rather than adding raw fields to BatchLine just for this lookup.
  // Matching stays variant-only (any batch of the right size counts) even though each batch now
  // carries its own print detail - a blank shirt in stock still satisfies a blank order either way.
  const stockRows = (l: (typeof lines)[number]) => l.product_id
    ? stock.filter((s) => s.product_id === l.product_id && s.audience === l.audience && s.version === (l.version === "Player" ? "player" : "fan") && s.sleeve === (l.sleeve === "Long" ? "long" : "short") && s.size === l.size)
    : null;
  const describeStock = (rows: ReturnType<typeof stockRows>) => (rows ?? []).map((r) => {
    const print = [r.print_name, r.print_number].filter(Boolean).join(" ") || "blank";
    const badges = r.patches.length ? ` + ${r.patches.map((p) => PATCHES[p as PatchId]?.label_ar ?? p).join(" + ")}` : "";
    return `${r.qty}× ${print}${badges}`;
  }).join(", ");
  // keychains / scarves (owner request 2026-11-10: accessories are really sold online)
  const accessories = ((await db().from("order_accessories").select("handle,title,qty").eq("order_id", o.id).order("created_at")).data ?? []) as { handle: string; title: string; qty: number }[];
  const events = (await db().from("order_events").select("from_status,to_status,actor,note,created_at").eq("order_id", o.id).order("created_at")).data ?? [];
  const a = o.address ?? {};
  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.draft;
  const flow = ["confirmed", "paid", "in_supplier_batch", "produced", "at_warehouse", "with_courier", "delivered", "issue", "cancelled"];
  // the current status is always the default, so Save never changes it by accident
  const next = flow.includes(o.status) ? flow : [o.status, ...flow];
  const awaitingOk = o.status === "awaiting_confirmation" && o.source === "website";
  // Personal Bit / PayPal.Me (owner requests 2026-11-10): only the owner's check below marks these paid
  const isManual = o.payment_method === "bit_personal" || o.payment_method === "paypal_me";
  let manual: ManualPaymentInfo | null = null;
  if (isManual) {
    const p = await manualPaymentFor(o.id);
    const cfg = await getManualPayConfig();
    const state = manualPayState({ orderStatus: o.status, paymentStatus: o.payment_status ?? "unpaid", payment: p ? { status: p.status, reportedAt: p.reported_at, reviewNote: p.review_note } : null });
    manual = {
      orderId: o.id, method: o.payment_method as ManualPaymentInfo["method"], expected: formatIls(o.total), note: transferNote(o.number), state,
      reference: p?.customer_reference ?? null, proofUrl: p?.proof_path ? await proofUrl(p.proof_path) : null,
      reportedAt: p?.reported_at ? ilTime(p.reported_at) : null, received: p?.received_amount != null ? formatIls(p.received_amount) : null,
      verifiedAt: p?.verified_at ? ilTime(p.verified_at) : null, reviewNote: p?.review_note ?? null,
      payee: o.payment_method === "bit_personal" ? (cfg.bit.phone ? formatBitPhone(cfg.bit.phone) : null) : cfg.paypalMe.username ? `paypal.me/${cfg.paypalMe.username}` : null,
    };
  }
  const awaitingManual = !!manual && (manual.state === "awaiting_payment" || manual.state === "awaiting_verification" || manual.state === "needs_resubmit");
  const stLabel = o.status === "awaiting_payment_verification" ? `Awaiting ${o.payment_method === "bit_personal" ? "Bit" : "PayPal"} payment verification` : st.label;
  const msgLabels: Record<string, string> = { produced: "Produced", at_warehouse: "At warehouse", with_courier: "With courier" };

  return (
    <>
      <Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Orders</Link>
      <PageHeader title={`Order #${o.number}`} subtitle={<span className="inline-flex items-center gap-2"><Badge tone={st.tone}>{stLabel}</Badge><span>₪{o.total / 100} · {payLabel(o.payment_method, o.payment_status, true)}</span></span>}
        actions={<>
          <a href={`/o/${orderToken(o.id)}`} target="_blank" rel="noreferrer" className={button.ghost}><ExternalLink className="h-4 w-4" /> Customer page</a>
          {o.conversation_id ? <Link href={`/admin/inbox/${o.conversation_id}`} className={button.ghost}><MessagesSquare className="h-4 w-4" /> Chat</Link> : null}
          {o.status !== "cancelled" && !awaitingOk ? <CancelOrderButton orderId={o.id} number={o.number} /> : null}
        </>} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>Shirts</SectionTitle>
            <div className="divide-y divide-line">
              {lines.map((l, i) => {
                const rows = stockRows(l);
                const total = rows?.reduce((n, r) => n + r.qty, 0) ?? null;
                return (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{l.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>{l.version}</Badge><Badge>{l.sleeve} sleeve</Badge><Badge tone="ink">{l.size}</Badge>{l.qty > 1 ? <Badge>×{l.qty}</Badge> : null}
                      {l.print_name || l.print_number ? <Badge tone="green">{[l.print_name, l.print_number].filter(Boolean).join(" ")}</Badge> : null}
                      {l.patches ? <Badge>{l.patches}</Badge> : null}{l.box ? <Badge>gift box</Badge> : null}
                      {total !== null ? (total > 0 ? <Badge tone="green">In stock ({total})</Badge> : <Badge tone="amber">Order from supplier</Badge>) : null}
                    </div>
                    {total ? <div className="mt-1 text-xs text-muted">On hand: {describeStock(rows)}</div> : null}
                  </div>
                  {l.supplier_album ? <a href={l.supplier_album} target="_blank" rel="noreferrer" className={button.subtle} aria-label="Supplier album"><ExternalLink className="h-4 w-4" /></a> : null}
                </div>
                );
              })}
            </div>
            {o.quote?.summaryAr ? <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm text-ink-2" dir="auto">{o.quote.summaryAr}</p> : null}
          </Card>
          {accessories.length ? (
            <Card>
              <SectionTitle>Accessories</SectionTitle>
              <div className="divide-y divide-line">
                {accessories.map((x) => (
                  <div key={x.handle} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <span className="font-medium">{x.title}</span>
                    <Badge>×{x.qty}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          <Card>
            <SectionTitle>History</SectionTitle>
            <ol className="flex flex-col gap-2 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-xs text-muted">{ilTime(e.created_at)}</span><span>{(ORDER_STATUS[e.to_status] ?? { label: e.to_status }).label}<span className="text-muted"> · {e.actor}{e.note ? ` · ${e.note}` : ""}</span></span></li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {o.status === "cancelled" && !o.returned_to_inventory_at ? <CancelInventoryPrompt orderId={o.id} lines={lines} /> : null}
          <Card>
            <SectionTitle>Delivery</SectionTitle>
            <div className="flex flex-col gap-2 text-sm">
              <div className="font-medium" dir="auto">{a.full_name}</div>
              <div className="flex items-center gap-2 text-ink-2"><Phone className="h-4 w-4 text-muted" /><a href={`tel:${a.phone}`} className="tabular-nums hover:underline">{a.phone}</a>{a.phone_alt ? <span className="text-muted"> / {a.phone_alt}</span> : null}</div>
              <div className="flex items-start gap-2 text-ink-2" dir="auto"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{[a.town, a.street, a.house_number, a.landmark].filter(Boolean).join("، ")}</div>
            </div>
          </Card>
          {manual ? <ManualPaymentCard p={manual} /> : null}
          {awaitingManual ? null : awaitingOk ? (
            <Card>
              <SectionTitle>Website order - waiting for your OK</SectionTitle>
              <p className="mb-3 text-sm text-muted">Approve to send it into the normal flow (supplier batch, delivery). Decline cancels it.</p>
              <div className="flex gap-2">
                <form action={approveWebOrder}><input type="hidden" name="orderId" value={o.id} /><button className={button.primary}><Check className="h-4 w-4" /> Approve</button></form>
                <form action={declineWebOrder}><input type="hidden" name="orderId" value={o.id} /><button className={button.danger}><X className="h-4 w-4" /> Decline</button></form>
              </div>
            </Card>
          ) : (
          <Card>
            <SectionTitle>Update status</SectionTitle>
            <form action={changeOrderStatus} className="flex flex-col gap-3 text-sm">
              <input type="hidden" name="orderId" value={o.id} />
              <select name="status" defaultValue={o.status} className={input}>
                {next.map((s) => <option key={s} value={s}>{(ORDER_STATUS[s] ?? { label: s }).label}</option>)}
              </select>
              {o.conversation_id ? (
                <label className="flex items-start gap-2.5 rounded-xl bg-paper p-3">
                  <input type="checkbox" name="notify" className="mt-0.5 h-4 w-4 accent-[var(--pitch)]" />
                  <span>Message the customer on Instagram
                    <span className="mt-1 block text-xs text-muted">Only for: {Object.keys(STATUS_MESSAGE).map((k) => msgLabels[k]).join(", ")}. Sent in your style, in Arabic.</span>
                  </span>
                </label>
              ) : null}
              <input name="note" placeholder="Note (optional)" className={input} />
              <button className={`${button.primary} self-start`}>Save</button>
            </form>
          </Card>
          )}
        </div>
      </div>
    </>
  );
}
