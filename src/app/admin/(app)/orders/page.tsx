import Link from "next/link";
import { Package, Truck, Check, X, ClipboardCheck, Search, Filter } from "lucide-react";
import { db } from "@/lib/db";
import { createSupplierBatch, approveWebOrder, declineWebOrder } from "../../orders-actions";
import { PageHeader, Card, Badge, EmptyState, ORDER_STATUS, button, ilTime, payLabel, input, ils, Tabs } from "../../ui";
import { SubmitButton } from "../../submit-button";
import { allOrders, customerName, PENDING } from "../../metrics";
import { israelDayStart, israelDayEnd } from "@/lib/time";

export const dynamic = "force-dynamic";

const TAB_STATUSES: Record<string, string[] | null> = {
  open: null, // sales not delivered / cancelled
  confirmed: ["confirmed"],
  with_courier: ["with_courier"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
  all: null,
};

/**
 * Orders (admin redesign 2026-11-10): status tabs, search and filters (date,
 * payment, method, source) over every order past checkout, and the same
 * "create supplier batch" selection as before. Filtering happens on this
 * page's own query - no business logic changed.
 */
export default async function Orders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const status = str("status") || "open";
  const f = { q: str("q"), pay: str("pay"), method: str("method"), source: str("source"), from: str("from"), to: str("to") };

  if (status === "needs_approval") return <NeedsApproval />;

  const orders = (await allOrders()).filter((o) => o.status !== "quoted");
  const sales = orders.filter((o) => !PRE.includes(o.status));
  let rows = status === "all" ? orders : status === "open" ? sales.filter((o) => !["delivered", "cancelled"].includes(o.status)) : sales.filter((o) => (TAB_STATUSES[status] ?? []).includes(o.status));
  const q = f.q.toLowerCase().replace(/^#/, "");
  const digits = q.replace(/\D/g, "");
  if (q) rows = rows.filter((o) => String(o.number) === q || customerName(o).toLowerCase().includes(q) || (o.address?.town ?? "").includes(f.q)
    || (o.customer?.ig_username ?? "").toLowerCase().includes(q) || (digits.length >= 4 && (o.address?.phone ?? "").replace(/\D/g, "").includes(digits)));
  if (f.pay) rows = rows.filter((o) => (f.pay === "paid" ? o.payment_status === "paid" : o.payment_status !== "paid"));
  if (f.method) rows = rows.filter((o) => (o.payment_method ?? "cod") === f.method);
  if (f.source) rows = rows.filter((o) => (o.source ?? "instagram") === f.source);
  if (f.from) rows = rows.filter((o) => (o.confirmed_at ?? o.created_at) >= israelDayStart(new Date(`${f.from}T12:00:00Z`)));
  if (f.to) rows = rows.filter((o) => (o.confirmed_at ?? o.created_at) <= israelDayEnd(new Date(`${f.to}T12:00:00Z`)));
  rows.sort((a, b) => ((b.confirmed_at ?? b.created_at) > (a.confirmed_at ?? a.created_at) ? 1 : -1));

  const batchable = rows.some((r) => r.status === "confirmed" || r.status === "paid");
  const pendingCount = orders.filter((o) => PENDING.includes(o.status) && o.source === "website").length;
  const count = (st: string) => st === "open" ? sales.filter((o) => !["delivered", "cancelled"].includes(o.status)).length : st === "all" ? orders.length : sales.filter((o) => (TAB_STATUSES[st] ?? []).includes(o.status)).length;
  const filtered = Object.values(f).some(Boolean);
  const keep = (extra: Record<string, string>) => { const u = new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v)); return `/admin/orders?${u}`; };

  return (
    <>
      <PageHeader eyebrow="Sales" title="Orders" subtitle="Every order from the website and Instagram. Tick new ones to send to the supplier."
        actions={<Link href="/admin/orders/batches" className={button.ghost}><Truck className="h-4 w-4" /> Supplier batches</Link>} />
      <Tabs active={status} items={[
        { key: "needs_approval", href: "/admin/orders?status=needs_approval", label: "Needs approval", count: pendingCount },
        ...[["open", "Open"], ["confirmed", "New"], ["with_courier", "With courier"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["all", "All"]].map(([k, label]) => ({ key: k, href: keep({ status: k }), label, count: count(k) })),
      ]} />

      <form method="get" action="/admin/orders" className="kv-card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(5,minmax(0,1fr))_auto] lg:items-end">
        <input type="hidden" name="status" value={status} />
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Search
          <span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={f.q} placeholder="Order #, name, phone, town" className={`${input} h-10 pl-9 normal-case tracking-normal`} /></span>
        </label>
        <Select name="pay" label="Payment" value={f.pay} options={[["", "Any"], ["paid", "Paid"], ["unpaid", "Not paid"]]} />
        <Select name="method" label="Method" value={f.method} options={[["", "Any"], ["cod", "Cash"], ["bit_personal", "Bit transfer"], ["paypal_me", "PayPal.Me"], ["paypal", "PayPal"], ["bit", "Bit (card page)"]]} />
        <Select name="source" label="Source" value={f.source} options={[["", "Any"], ["website", "Website"], ["instagram", "Instagram"]]} />
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">From<input type="date" name="from" defaultValue={f.from} className={`${input} h-10 py-0`} /></label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">To<input type="date" name="to" defaultValue={f.to} className={`${input} h-10 py-0`} /></label>
        <div className="flex gap-2">
          <SubmitButton bare className={`${button.primary} h-10`}><Filter className="h-4 w-4" /> Apply</SubmitButton>
          {filtered ? <Link href={`/admin/orders?status=${status}`} className={button.subtle}>Clear</Link> : null}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{rows.length} order{rows.length === 1 ? "" : "s"}{filtered ? " match" : ""} · <span className="font-semibold text-ink">{ils(rows.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0))}</span></span>
        {batchable ? <span className="text-xs">New and paid orders are pre-ticked for the next supplier batch.</span> : null}
      </div>

      {!rows.length ? <EmptyState icon={Package} title="No orders here" text={filtered ? "Nothing matches these filters." : "Orders show up here once they're confirmed."} /> : (
        <form action={createSupplierBatch} className="flex flex-col gap-3">
          <div className="kv-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="kv-adm-table">
                <thead>
                  <tr><th className="w-10"><span className="sr-only">Select</span></th><th>Order</th><th>Customer</th><th className="hidden md:table-cell">Source</th><th className="hidden lg:table-cell">Payment</th><th>Status</th><th className="text-end">Total</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((o) => {
                    const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.draft;
                    const canBatch = o.status === "confirmed" || o.status === "paid";
                    const test = o.customer?.ig_user_id?.startsWith("sim:");
                    return (
                      <tr key={o.id}>
                        <td>{canBatch ? <input type="checkbox" name="orderId" value={o.id} defaultChecked className="h-4 w-4 accent-[var(--pitch-fill)]" aria-label={`Select order ${o.number}`} /> : null}</td>
                        <td className="whitespace-nowrap">
                          <Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink hover:text-pitch">#{o.number}</Link>
                          <div className="text-[11px] text-muted">{ilTime(o.confirmed_at ?? o.created_at)}</div>
                        </td>
                        <td className="max-w-[240px]">
                          <Link href={`/admin/customers/${o.customer_id}`} className="block truncate text-ink-2 hover:text-ink" dir="auto">{customerName(o)}</Link>
                          <div className="truncate text-[11px] text-muted"><span dir="auto">{o.address?.town ?? ""}</span>{o.address?.phone ? <span className="ms-1.5 tabular-nums" dir="ltr">{o.address.phone}</span> : null}</div>
                        </td>
                        <td className="hidden md:table-cell">{o.source === "website" ? <Badge tone="blue">Website</Badge> : <Badge>Instagram</Badge>}{test ? <Badge className="ms-1">test</Badge> : null}</td>
                        <td className="hidden whitespace-nowrap text-muted lg:table-cell">{payLabel(o.payment_method, o.payment_status)}</td>
                        <td><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className="whitespace-nowrap text-end font-semibold tabular-nums">{ils(o.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {rows.length > 300 ? <p className="text-xs text-muted">Showing the newest 300 - narrow the filters to see older ones.</p> : null}
          {batchable ? <SubmitButton className="self-start" pendingText="Creating batch…"><Truck className="h-4 w-4" /> Create supplier batch from selected</SubmitButton> : null}
        </form>
      )}
    </>
  );
}

/** Statuses before an order is confirmed (shown under "Needs approval" / "All", not in the sales tabs). */
const PRE = ["quoted", "awaiting_details", "awaiting_confirmation", "awaiting_payment_verification"];

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}
      <select name={name} defaultValue={value} className={`${input} h-10 py-0 normal-case tracking-normal`}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Website orders waiting for the owner's OK (src/lib/orders/web.ts never auto-confirms). */
async function NeedsApproval() {
  const { data } = await db().from("orders")
    .select("id,number,total,payment_method,payment_status,created_at,address,quote")
    .eq("status", "awaiting_confirmation").eq("source", "website").order("created_at");
  const rows = (data ?? []) as unknown as { id: string; number: number; total: number; payment_method: string | null; payment_status: string | null; created_at: string; address: { full_name?: string; town?: string; phone?: string } | null; quote: { summaryAr?: string } | null }[];
  // Personal Bit / PayPal.Me (owner requests 2026-11-10): the customer says they paid - check your app, then confirm or reject on the order page
  const verify = ((await db().from("orders").select("id,number,total,payment_method,created_at,address")
    .eq("status", "awaiting_payment_verification").eq("source", "website").order("created_at")).data ?? []) as unknown as { id: string; number: number; total: number; payment_method: string | null; created_at: string; address: { full_name?: string; town?: string } | null }[];
  // ...and the ones still waiting for the customer to pay (nothing to do yet, listed so a transfer without a report can still be matched)
  const unpaid = ((await db().from("orders").select("id,number,total,payment_method,created_at,address")
    .eq("status", "quoted").eq("source", "website").eq("payment_status", "unpaid").in("payment_method", ["bit_personal", "paypal_me"]).order("created_at", { ascending: false }).limit(20)).data ?? []) as unknown as typeof verify;
  const tabs = [["needs_approval", "Needs approval"], ["open", "Open"], ["confirmed", "New"], ["with_courier", "With courier"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["all", "All"]];

  return (
    <>
      <PageHeader eyebrow="Sales" title="Orders" subtitle="Website orders waiting for your OK before they go to production."
        actions={<Link href="/admin/orders/batches" className={button.ghost}><Truck className="h-4 w-4" /> Supplier batches</Link>} />
      <Tabs active="needs_approval" items={tabs.map(([k, label]) => ({ key: k, href: `/admin/orders?status=${k}`, label, count: k === "needs_approval" ? rows.length + verify.length : undefined }))} />
      {verify.length ? (
        <>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-gold">Payments to verify ({verify.length})</h2>
          <Card padded={false} className="mb-5 divide-y divide-line overflow-hidden">
            {verify.map((o) => <ManualRow key={o.id} o={o} badge={<Badge tone="amber">Verify payment</Badge>} />)}
          </Card>
        </>
      ) : null}
      {!rows.length && verify.length ? null : !rows.length ? <EmptyState icon={ClipboardCheck} title="Nothing waiting" text="New website orders show up here the moment they're placed." /> : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {rows.map((o) => (
            <div key={o.id} className="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <Link href={`/admin/orders/${o.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">#{o.number}</span>
                    <span className="truncate text-sm" dir="auto">{o.address?.full_name ?? ""}</span>
                    <Badge tone="green">website</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <span dir="auto">{o.address?.town ?? ""}</span>·<span>{payLabel(o.payment_method, o.payment_status)}</span>·<span>{ilTime(o.created_at)}</span>
                  </div>
                </Link>
                <span className="font-medium tabular-nums">₪{o.total / 100}</span>
              </div>
              {o.quote?.summaryAr ? <p className="rounded-lg bg-paper px-3 py-2 text-sm text-ink-2" dir="auto">{o.quote.summaryAr}</p> : null}
              <div className="flex gap-2">
                <form action={approveWebOrder}><input type="hidden" name="orderId" value={o.id} /><SubmitButton bare className={button.primary}><Check className="h-4 w-4" /> Approve</SubmitButton></form>
                <form action={declineWebOrder}><input type="hidden" name="orderId" value={o.id} /><SubmitButton bare className={button.danger}><X className="h-4 w-4" /> Decline</SubmitButton></form>
              </div>
            </div>
          ))}
        </Card>
      )}
      {unpaid.length ? (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-muted">Waiting for the customer to pay - Bit / PayPal.Me ({unpaid.length})</summary>
          <Card padded={false} className="mt-2 divide-y divide-line overflow-hidden">
            {unpaid.map((o) => <ManualRow key={o.id} o={o} badge={<Badge>Not paid yet</Badge>} />)}
          </Card>
        </details>
      ) : null}
    </>
  );
}

function ManualRow({ o, badge }: { o: { id: string; number: number; total: number; payment_method: string | null; created_at: string; address: { full_name?: string; town?: string } | null }; badge: React.ReactNode }) {
  return (
    <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium tabular-nums">#{o.number}</span>
          <span className="truncate text-sm" dir="auto">{o.address?.full_name ?? ""}</span>
          {badge}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>{payLabel(o.payment_method, "unpaid", true).split(" · ")[0]}</span>·<span>note KV{o.number}</span>·<span>{ilTime(o.created_at)}</span>
        </div>
      </div>
      <span className="font-medium tabular-nums">₪{o.total / 100}</span>
    </Link>
  );
}
