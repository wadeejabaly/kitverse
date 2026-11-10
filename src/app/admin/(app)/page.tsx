import Link from "next/link";
import {
  ClipboardCheck, ShoppingBag, Wallet, Cpu, ArrowRight, MessagesSquare, Images, Truck, ImageOff, Clock, CheckCircle2, Users, Receipt,
  Shirt, PackageOpen, Bell, CreditCard,
} from "lucide-react";
import { db } from "@/lib/db";
import { israelDayStart } from "@/lib/time";
import { PageHeader, Card, SectionTitle, Badge, EmptyState, KIND, ORDER_STATUS, Kpi, StatusDot, ils, timeAgo, payLabel, cx } from "../ui";
import { AreaChart, BarChart, Donut, RankList, ChartCard, SERIES } from "../charts";
import { allOrders, customerName, dailySeries, delta, isSale, PENDING, productSales, summarize } from "../metrics";

export const dynamic = "force-dynamic";

const STATUS_GROUPS: { label: string; statuses: string[]; color: string }[] = [
  { label: "Waiting for you", statuses: PENDING, color: SERIES[1] },
  { label: "New / paid", statuses: ["confirmed", "paid"], color: SERIES[0] },
  { label: "At the supplier", statuses: ["in_supplier_batch", "produced"], color: "#a78bfa" },
  { label: "On the way", statuses: ["at_warehouse", "with_courier"], color: SERIES[3] },
  { label: "Delivered", statuses: ["delivered"], color: SERIES[2] },
  { label: "Issue", statuses: ["issue"], color: SERIES[4] },
  { label: "Cancelled", statuses: ["cancelled"], color: "#3a4670" },
];

/**
 * The business at a glance (admin redesign 2026-11-10). Every number is
 * computed from the orders / order lines / customers tables on each load -
 * see ../metrics.ts for the definitions. Nothing here is estimated.
 */
export default async function Dashboard() {
  const now = new Date();
  const todayStart = israelDayStart();
  const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const d60 = new Date(now.getTime() - 60 * 86400_000).toISOString();

  const [orders, spend, pendingApprovals, approvalsRes, ownerChats, noPhoto, customersRes, notesRes, inboundRes] = await Promise.all([
    allOrders(),
    db().rpc("spend_today_usd"),
    db().from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db().from("approvals").select("id,kind,proposal,draft_reply,created_at,conversation:conversations(customer:customers(full_name,display_name,ig_username))").eq("status", "pending").order("created_at").limit(5),
    db().from("conversations").select("id,messages(direction,created_at)").eq("mode", "owner").eq("channel", "instagram")
      .order("created_at", { referencedTable: "messages", ascending: false }).limit(1, { referencedTable: "messages" }),
    db().from("products").select("id", { count: "exact", head: true }).eq("status", "featured").not("photo_status", "in", "(good,owner_upload)"),
    db().from("customers").select("id,ig_user_id"),
    db().from("notifications").select("id,title,body,link,priority,created_at,read_at").is("read_at", null).neq("priority", "quiet").order("created_at", { ascending: false }).limit(5),
    db().from("messages").select("id,created_at,text,conversation:conversations(id,customer:customers(full_name,display_name,ig_username))").eq("direction", "in").order("created_at", { ascending: false }).limit(6),
  ]);

  const all = summarize(orders);
  const last30 = summarize(orders, d30);
  const prev30 = summarize(orders.filter((o) => o.confirmed_at && o.confirmed_at < d30), d60);
  const today = summarize(orders, todayStart);
  const pending = orders.filter((o) => PENDING.includes(o.status));
  const webPending = pending.filter((o) => o.source === "website").length;
  const delivered = orders.filter((o) => isSale(o) && o.status === "delivered").length;
  const outstanding = orders.filter((o) => isSale(o) && !["delivered", "cancelled"].includes(o.status)).length;
  const customers = ((customersRes.data ?? []) as { id: string; ig_user_id: string | null }[]).filter((c) => !c.ig_user_id?.startsWith("sim:"));
  const products = await productSales(all.sales.map((o) => o.id));

  const series30 = dailySeries(orders, 30, now);
  const series14 = series30.slice(-14);
  const statusData = STATUS_GROUPS.map((g) => ({ label: g.label, value: orders.filter((o) => g.statuses.includes(o.status) && !o.customer?.ig_user_id?.startsWith("sim:")).length, color: g.color })).filter((d) => d.value > 0);
  const revenueDelta = delta(last30.revenue, prev30.revenue);

  const needsReply = ((ownerChats.data ?? []) as { messages: { direction: string }[] }[]).filter((c) => c.messages[0]?.direction === "in").length;
  const approvals = (approvalsRes.data ?? []) as unknown as { id: string; kind: string; proposal: { summary?: string }; draft_reply: string | null; created_at: string; conversation: { customer: { full_name: string | null; display_name: string | null; ig_username: string | null } } | null }[];
  const notes = (notesRes.data ?? []) as { id: string; title: string; body: string | null; link: string | null; priority: string; created_at: string }[];
  type Inbound = { id: string; created_at: string; text: string | null; conversation: { id: string; customer: { full_name: string | null; display_name: string | null; ig_username: string | null } | null } | null };
  const activity = [
    ...((inboundRes.data ?? []) as unknown as Inbound[]).map((m) => ({
      key: `m${m.id}`, at: m.created_at, href: m.conversation ? `/admin/inbox/${m.conversation.id}` : "/admin/inbox", icon: MessagesSquare, tone: "text-pitch",
      who: m.conversation?.customer?.full_name ?? m.conversation?.customer?.display_name ?? (m.conversation?.customer?.ig_username ? `@${m.conversation.customer.ig_username}` : "Customer"),
      what: m.text ? `“${m.text.slice(0, 70)}${m.text.length > 70 ? "…" : ""}”` : "sent a message",
    })),
    ...orders.slice(0, 8).map((o) => ({
      key: `o${o.id}`, at: o.created_at, href: `/admin/orders/${o.id}`, icon: ShoppingBag, tone: "text-gold",
      who: customerName(o), what: `placed order #${o.number} · ${ils(o.total)}`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);

  const alerts = [
    webPending ? { href: "/admin/orders?status=needs_approval", icon: ShoppingBag, text: `${webPending} website order${webPending > 1 ? "s" : ""} waiting for your OK`, tone: "blue" as const } : null,
    needsReply ? { href: "/admin/inbox?filter=owner", icon: MessagesSquare, text: `${needsReply} chat${needsReply > 1 ? "s" : ""} waiting for your reply`, tone: "blue" as const } : null,
    noPhoto.count ? { href: "/admin/photos", icon: ImageOff, text: `${noPhoto.count} website shirt${noPhoto.count > 1 ? "s have" : " has"} no photo yet`, tone: "amber" as const } : null,
  ].filter(Boolean) as { href: string; icon: typeof ShoppingBag; text: string; tone: "blue" | "amber" }[];

  return (
    <>
      <PageHeader eyebrow="Dashboard" title="Business overview"
        subtitle="Live from your orders. Sales = orders you confirmed that weren't cancelled; test-bot orders never count."
        actions={<><Link href="/admin/orders" className="inline-flex items-center gap-1.5 rounded-xl border border-line-2 bg-raised/40 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-raised">All orders</Link><Link href="/admin/stats" className="inline-flex items-center gap-1.5 rounded-xl bg-pitch-fill px-3.5 py-2 text-sm font-semibold text-white hover:bg-pitch-fill-2">Analytics <ArrowRight className="h-4 w-4" /></Link></>} />

      {alerts.length ? (
        <div className="mb-6 grid gap-2.5 md:grid-cols-3">
          {alerts.map((a) => (
            <Link key={a.href} href={a.href} className={cx("kv-card flex items-center gap-3 border-l-[3px] px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-line-2", a.tone === "amber" ? "border-l-amber" : "border-l-pitch-fill")}>
              <a.icon className={cx("h-4 w-4 shrink-0", a.tone === "amber" ? "text-amber" : "text-pitch")} />
              <span className="min-w-0 flex-1">{a.text}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Total revenue" icon={Wallet} value={ils(all.revenue)} tone="gold" trend={series14.map((d) => d.revenue)}
          hint={<>{ils(last30.revenue)} last 30 days{revenueDelta !== null ? <span className={cx("ms-1.5 font-semibold", revenueDelta >= 0 ? "text-green" : "text-red")}>{revenueDelta >= 0 ? "▲" : "▼"} {Math.abs(revenueDelta)}%</span> : null}</>} />
        <Kpi label="Total orders" icon={Receipt} value={all.count.toLocaleString()} trend={series14.map((d) => d.orders)} hint={`${today.count} today · ${last30.count} in 30 days`} href="/admin/orders?status=all" />
        <Kpi label="Pending orders" icon={Clock} value={pending.length} tone="amber" hint="Waiting for your OK or payment check" href="/admin/orders?status=needs_approval" />
        <Kpi label="Completed orders" icon={CheckCircle2} value={delivered} tone="green" hint="Delivered to the customer" href="/admin/orders?status=delivered" />
        <Kpi label="Customers" icon={Users} value={customers.length.toLocaleString()} hint={`${all.buyers} have bought`} href="/admin/customers" />
        <Kpi label="Average order value" icon={CreditCard} value={ils(all.aov)} tone="gold" hint={last30.count ? `${ils(last30.aov)} last 30 days` : "No sales in 30 days"} />
        <Kpi label="Products sold" icon={Shirt} value={(products.shirtsSold + products.accessoriesSold).toLocaleString()} hint={`${products.shirtsSold} shirts · ${products.accessoriesSold} accessories`} />
        <Kpi label="Outstanding orders" icon={PackageOpen} value={outstanding} tone="blue" hint="Sold, not delivered yet" href="/admin/orders?status=open" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <ChartCard title="Revenue · last 30 days" figure={ils(last30.revenue)} sub="By the day you confirmed each order (Israel time)">
          <AreaChart data={series30.map((d) => ({ label: d.label, value: d.revenue / 100 }))} format={(v) => `₪${Math.round(v).toLocaleString()}`} />
        </ChartCard>
        <ChartCard title="Order status" sub={`${statusData.reduce((s, d) => s + d.value, 0)} orders past draft`}>
          {statusData.length ? (
            <Donut data={statusData} center={{ value: String(pending.length), label: "waiting" }} />
          ) : <EmptyState icon={Receipt} title="No orders yet" />}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Orders per day · last 30 days" figure={last30.count}>
          <BarChart data={series30.map((d) => ({ label: d.label, value: d.orders }))} />
        </ChartCard>
        <ChartCard title="Best-selling jerseys" sub="Shirts sold, all time">
          <RankList rows={products.best.slice(0, 6).map((b) => ({ label: b.title, value: b.qty, sub: `${b.orders.size} order${b.orders.size === 1 ? "" : "s"}` }))}
            color="#d4b26a" empty={<EmptyState icon={Shirt} title="No shirts sold yet" />} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="kv-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Recent orders</h2>
            <Link href="/admin/orders?status=all" className="text-sm font-medium text-link hover:underline">View all</Link>
          </div>
          {orders.length ? (
            <div className="overflow-x-auto">
              <table className="kv-adm-table">
                <thead><tr><th>Order</th><th>Customer</th><th className="hidden sm:table-cell">Payment</th><th>Status</th><th className="text-end">Total</th></tr></thead>
                <tbody>
                  {orders.slice(0, 7).map((o) => {
                    const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.draft;
                    return (
                      <tr key={o.id}>
                        <td><Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink hover:text-pitch">#{o.number}</Link><div className="text-[11px] text-muted">{timeAgo(o.created_at)} ago</div></td>
                        <td className="max-w-[180px]"><div className="truncate text-ink-2" dir="auto">{customerName(o)}</div><div className="truncate text-[11px] text-muted" dir="auto">{o.address?.town ?? ""}</div></td>
                        <td className="hidden text-muted sm:table-cell">{payLabel(o.payment_method, o.payment_status)}</td>
                        <td><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className="text-end font-semibold tabular-nums">{ils(o.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="p-5"><EmptyState icon={ShoppingBag} title="No orders yet" /></div>}
        </section>

        <div className="flex flex-col gap-4">
          <ChartCard title="Latest activity">
            {activity.length ? (
              <ol className="flex flex-col">
                {activity.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-raised/60">
                      <span className={cx("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-raised", a.tone)}><a.icon className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0 flex-1 text-[13px] leading-snug">
                        <span className="font-semibold text-ink" dir="auto">{a.who}</span> <span className="text-muted" dir="auto">{a.what}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted">{timeAgo(a.at)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">Nothing yet.</p>}
          </ChartCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <SectionTitle action={<Link href="/admin/approvals" className="text-sm font-medium text-link hover:underline">View all</Link>}>Needs your decision {pendingApprovals.count ? <span className="ms-1 text-gold">{pendingApprovals.count}</span> : null}</SectionTitle>
          {approvals.length ? (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {approvals.map((a) => {
                const c = a.conversation?.customer;
                const k = KIND[a.kind] ?? KIND.other;
                return (
                  <Link key={a.id} href={`/admin/approvals/${a.id}`} className="flex flex-col gap-1.5 px-4 py-3.5 hover:bg-raised/60">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Badge tone={k.tone}>{k.label}</Badge>
                      <span className="truncate">{c?.full_name ?? c?.display_name ?? c?.ig_username ?? "Customer"}</span>
                      <span className="ml-auto">{timeAgo(a.created_at)}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-ink-2" dir="auto">{a.kind === "draft_reply" ? a.draft_reply : a.proposal.summary}</p>
                  </Link>
                );
              })}
            </Card>
          ) : <EmptyState icon={ClipboardCheck} title="All clear" text="Nothing is waiting for you right now." />}
        </section>

        <section>
          <SectionTitle action={<Link href="/admin/notifications" className="text-sm font-medium text-link hover:underline">All</Link>}>Notifications</SectionTitle>
          {notes.length ? (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {notes.map((n) => (
                <Link key={n.id} href={n.link ?? "/admin/notifications"} className="flex items-start gap-3 px-4 py-3 hover:bg-raised/60">
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.priority === "urgent" ? "bg-gold" : "bg-pitch")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
                    {n.body ? <span className="block truncate text-xs text-muted" dir="auto">{n.body}</span> : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                </Link>
              ))}
            </Card>
          ) : <EmptyState icon={Bell} title="No new notifications" />}
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <SectionTitle>Today</SectionTitle>
            <Card className="grid grid-cols-3 gap-3 text-center">
              <div><div className="kv-display text-xl font-bold tabular-nums">{today.count}</div><div className="text-[11px] text-muted">Orders</div></div>
              <div><div className="kv-display text-xl font-bold tabular-nums">{ils(today.revenue)}</div><div className="text-[11px] text-muted">Sales</div></div>
              <div><div className="kv-display text-xl font-bold tabular-nums">${Number(spend.data ?? 0).toFixed(2)}</div><div className="flex items-center justify-center gap-1 text-[11px] text-muted"><Cpu className="h-3 w-3" />AI cost</div></div>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/admin/media" className="group"><Card className="flex h-full flex-col gap-2 transition-colors group-hover:border-line-2"><Images className="h-5 w-5 text-pitch" strokeWidth={1.75} /><span className="text-sm font-semibold">Posts & shirts</span><span className="text-xs text-muted">Confirm which shirts each post shows</span></Card></Link>
            <Link href="/admin/orders/batches" className="group"><Card className="flex h-full flex-col gap-2 transition-colors group-hover:border-line-2"><Truck className="h-5 w-5 text-gold" strokeWidth={1.75} /><span className="text-sm font-semibold">Supplier batches</span><span className="text-xs text-muted">Sheets to send the supplier</span></Card></Link>
          </div>
          <StatusDot tone="green">All figures exclude test-bot orders</StatusDot>
        </section>
      </div>
    </>
  );
}
