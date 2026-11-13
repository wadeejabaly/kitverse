import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare, Phone, MapPin, ExternalLink, Check, X, User, CreditCard, Shirt } from "lucide-react";
import { db } from "@/lib/db";
import { STATUS_MESSAGE, batchLines } from "@/lib/orders/admin";
import { orderToken } from "@/lib/orders/link";
import { PATCHES, type PatchId } from "@/lib/orders/rules";
import { approveWebOrder, changeOrderStatus, declineWebOrder } from "../../../orders-actions";
import { PageHeader, Card, Badge, SectionTitle, button, input, ORDER_STATUS, ilTime, payLabel, ils, KV, cx } from "../../../ui";
import { SubmitButton } from "../../../submit-button";
import { CancelOrderButton } from "./cancel-order-button";
import { DeleteCancelledOrders } from "../delete-cancelled";
import { CancelInventoryPrompt } from "./cancel-inventory-prompt";
import { ManualPaymentCard, type ManualPaymentInfo } from "./manual-payment-card";
import { getManualPayConfig, manualPaymentFor, proofUrl } from "@/lib/orders/manual-pay";
import { formatBitPhone, formatIls, manualPayState, transferNote } from "@/lib/manual-pay-core";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const o = (await db().from("orders").select("*").eq("id", id).maybeSingle()).data as
    { id: string; number: number; status: string; source: string; total: number; customer_id: string; created_at: string; confirmed_at: string | null; conversation_id: string | null; payment_method: string | null; payment_status: string | null; address: Record<string, string | null> | null; quote: { summaryAr?: string; itemsTotal?: number; discountTotal?: number; delivery?: { fee: number; label?: string } | null; orderAddons?: { label: string; amount: number }[] } | null; returned_to_inventory_at: string | null } | null;
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
  const msgLabels: Record<string, string> = { produced: "Shipped", at_warehouse: "At warehouse", with_courier: "Out for delivery" };

  return (
    <>
      <Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Orders</Link>
      <PageHeader eyebrow={o.source === "website" ? "Website order" : "Instagram order"} title={`Order #${o.number}`}
        subtitle={<span className="mt-1 inline-flex flex-wrap items-center gap-2"><Badge tone={st.tone}>{stLabel}</Badge><Badge tone={o.payment_status === "paid" ? "green" : "neutral"}>{payLabel(o.payment_method, o.payment_status, true)}</Badge><span>{ils(o.total)} · placed {ilTime(o.created_at)}</span></span>}
        actions={<>
          <a href={`/o/${orderToken(o.id)}`} target="_blank" rel="noreferrer" className={button.ghost}><ExternalLink className="h-4 w-4" /> Customer page</a>
          {o.conversation_id ? <Link href={`/admin/inbox/${o.conversation_id}`} className={button.ghost}><MessagesSquare className="h-4 w-4" /> Chat</Link> : null}
          {o.status !== "cancelled" && !awaitingOk ? <CancelOrderButton orderId={o.id} number={o.number} /> : null}
          {o.status === "cancelled" ? <DeleteCancelledOrders orderId={o.id} number={o.number} /> : null}
        </>} />

      <Progress status={o.status} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle><span className="inline-flex items-center gap-2"><Shirt className="h-3.5 w-3.5" /> Shirts</span></SectionTitle>
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
            {o.quote?.summaryAr ? <p className="mt-4 rounded-xl bg-raised/60 px-3 py-2 text-sm text-ink-2" dir="auto">{o.quote.summaryAr}</p> : null}
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
            {events.length ? (
              <ol className="relative ms-1.5 flex flex-col gap-4 border-s border-line-2 ps-5 text-sm">
                {events.map((e, i) => {
                  const es = ORDER_STATUS[e.to_status] ?? { label: e.to_status, tone: "neutral" as const };
                  return (
                    <li key={i} className="relative">
                      <span className={cx("absolute -start-[25.5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface", i === events.length - 1 ? "bg-pitch-fill" : "bg-line-2")} />
                      <div className="flex flex-wrap items-center gap-2"><Badge tone={es.tone}>{es.label}</Badge><span className="text-xs text-muted">{ilTime(e.created_at)} · {e.actor}</span></div>
                      {e.note ? <p className="mt-1 text-[13px] text-ink-2" dir="auto">{e.note}</p> : null}
                    </li>
                  );
                })}
              </ol>
            ) : <p className="text-sm text-muted">No changes recorded yet.</p>}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {o.status === "cancelled" && !o.returned_to_inventory_at ? <CancelInventoryPrompt orderId={o.id} lines={lines} /> : null}
          <Card>
            <SectionTitle action={<Link href={`/admin/customers/${o.customer_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"><User className="h-3.5 w-3.5" /> Profile</Link>}>Customer & delivery</SectionTitle>
            <div className="flex flex-col gap-2 text-sm">
              <div className="font-semibold" dir="auto">{a.full_name}</div>
              <div className="flex items-center gap-2 text-ink-2"><Phone className="h-4 w-4 text-muted" /><a href={`tel:${a.phone}`} className="tabular-nums hover:underline">{a.phone}</a>{a.phone_alt ? <span className="text-muted"> / {a.phone_alt}</span> : null}</div>
              <div className="flex items-start gap-2 text-ink-2" dir="auto"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{[a.town, a.street, a.house_number, a.landmark].filter(Boolean).join("، ")}</div>
            </div>
          </Card>
          <Card>
            <SectionTitle><span className="inline-flex items-center gap-2"><CreditCard className="h-3.5 w-3.5" /> Payment</span></SectionTitle>
            <div className="divide-y divide-line">
              <KV label="Method">{payLabel(o.payment_method, null, true)}</KV>
              <KV label="Status">{o.payment_status === "paid" ? <Badge tone="green">Paid</Badge> : o.payment_status === "refunded" ? <Badge tone="red">Refunded</Badge> : <Badge>{o.payment_method && o.payment_method !== "cod" ? "Not paid yet" : "Pays on delivery"}</Badge>}</KV>
              {o.quote?.itemsTotal != null ? <KV label="Items">{ils(o.quote.itemsTotal)}</KV> : null}
              {o.quote?.discountTotal ? <KV label="Discount"><span className="text-green">-{ils(o.quote.discountTotal)}</span></KV> : null}
              {o.quote?.delivery ? <KV label="Delivery">{ils(o.quote.delivery.fee)}</KV> : null}
              <KV label="Total"><span className="kv-display text-lg font-bold">{ils(o.total)}</span></KV>
            </div>
          </Card>
          {manual ? <ManualPaymentCard p={manual} /> : null}
          {awaitingManual ? null : awaitingOk ? (
            <Card>
              <SectionTitle>Website order - waiting for your OK</SectionTitle>
              <p className="mb-3 text-sm text-muted">Approve to send it into the normal flow (supplier batch, delivery). Decline cancels it.</p>
              <div className="flex gap-2">
                <form action={approveWebOrder}><input type="hidden" name="orderId" value={o.id} /><SubmitButton pendingText="Approving…"><Check className="h-4 w-4" /> Approve</SubmitButton></form>
                <form action={declineWebOrder}><input type="hidden" name="orderId" value={o.id} /><SubmitButton variant="danger" pendingText="Declining…"><X className="h-4 w-4" /> Decline</SubmitButton></form>
              </div>
            </Card>
          ) : (
          <Card>
            <SectionTitle>Update status</SectionTitle>
            <form action={changeOrderStatus} className="flex flex-col gap-3 text-sm">
              <input type="hidden" name="orderId" value={o.id} />
              <label className="flex flex-col gap-1.5 text-xs text-muted">Move this order to
                <select name="status" defaultValue={o.status} className={input}>
                  {next.map((s) => <option key={s} value={s}>{(ORDER_STATUS[s] ?? { label: s }).label}{s === o.status ? " (current)" : s === nextStep(o.status) ? " - next step" : ""}</option>)}
                </select>
              </label>
              {o.conversation_id ? (
                <label className="flex items-start gap-2.5 rounded-xl bg-raised/60 p-3">
                  <input type="checkbox" name="notify" className="mt-0.5 h-4 w-4 accent-[var(--pitch)]" />
                  <span>Message the customer on Instagram
                    <span className="mt-1 block text-xs text-muted">Only for: {Object.keys(STATUS_MESSAGE).map((k) => msgLabels[k]).join(", ")}. Sent in your style, in Arabic.</span>
                  </span>
                </label>
              ) : null}
              <input name="note" placeholder="Note (optional)" className={input} />
              <SubmitButton className="self-start" pendingText="Saving…">Save status</SubmitButton>
            </form>
          </Card>
          )}
        </div>
      </div>
    </>
  );
}

const STEPS = [
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed", "paid"] },
  { key: "in_supplier_batch", label: "At supplier", statuses: ["in_supplier_batch"] },
  { key: "produced", label: "Shipped", statuses: ["produced"] },
  { key: "at_warehouse", label: "At warehouse", statuses: ["at_warehouse"] },
  { key: "with_courier", label: "Out for delivery", statuses: ["with_courier"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

/** The status the order normally moves to next - marked in "Update status" (the current status stays selected, so Save never changes it by accident). */
function nextStep(status: string): string | null {
  const i = STEPS.findIndex((s) => s.statuses.includes(status));
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1].key : null;
}

/** Where the order is in its journey, at a glance. */
function Progress({ status }: { status: string }) {
  const at = STEPS.findIndex((s) => s.statuses.includes(status));
  if (status === "cancelled" || status === "issue") {
    return <div className={cx("kv-card mb-5 border-l-[3px] px-4 py-3 text-sm", status === "cancelled" ? "border-l-red text-red" : "border-l-amber text-amber")}>{status === "cancelled" ? "This order is cancelled." : "This order has an issue - check the history and notes."}</div>;
  }
  return (
    <div className="kv-card mb-5 overflow-x-auto px-4 py-4">
      <ol className="flex min-w-[560px] items-center">
        {STEPS.map((s, i) => {
          const done = at >= 0 && i < at, current = i === at;
          return (
            <li key={s.key} className="flex flex-1 items-center last:flex-none">
              <span className="flex items-center gap-2">
                <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold",
                  done ? "bg-pitch-fill text-white" : current ? "bg-gold text-[#1a1406] ring-4 ring-gold/20" : "bg-raised text-muted ring-1 ring-line-2")}>
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cx("whitespace-nowrap text-[13px] font-medium", current ? "text-ink" : done ? "text-ink-2" : "text-muted")}>{s.label}</span>
              </span>
              {i < STEPS.length - 1 ? <span className={cx("mx-3 h-px flex-1", done ? "bg-pitch-fill" : "bg-line-2")} /> : null}
            </li>
          );
        })}
      </ol>
      {at < 0 ? <p className="mt-3 text-xs text-muted">Not confirmed yet - the journey starts once you approve it (and, for Bit / PayPal.Me, once you confirm the payment).</p> : null}
    </div>
  );
}
