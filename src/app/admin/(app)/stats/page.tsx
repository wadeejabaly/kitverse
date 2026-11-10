import Link from "next/link";
import { Eye, Users, ShoppingCart, CreditCard, ShoppingBag, TrendingUp, Globe, Wallet, Receipt, Shirt, UserCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getProduct } from "@/data/catalog";
import { titleFor } from "@/lib/product";
import { israelDayStart, israelDayEnd } from "@/lib/time";
import { PageHeader, Card, Stat, SectionTitle, EmptyState, Kpi, Tabs, ils, cx } from "../../ui";
import { AreaChart, BarChart, Donut, RankList, ChartCard } from "../../charts";
import { allOrders, customerName, dailySeries, delta, METHOD_LABEL, productSales, summarize as summarizeSales } from "../../metrics";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30; // how far back site_events is fetched for this whole page
const TREND_DAYS = 14; // the daily bar chart's span

type EventRow = { type: string; session_id: string; path: string | null; product_handle: string | null; referrer_host: string | null; created_at: string };
type OrderRow = { total: number; confirmed_at: string; customer: { ig_user_id: string | null } | null };

function summarize(events: EventRow[], orders: OrderRow[], sinceIso: string) {
  const pv = events.filter((e) => e.type === "page_view" && e.created_at >= sinceIso);
  const atc = events.filter((e) => e.type === "add_to_cart" && e.created_at >= sinceIso);
  const co = events.filter((e) => e.type === "checkout_start" && e.created_at >= sinceIso);
  const ord = orders.filter((o) => o.confirmed_at >= sinceIso);
  return {
    visitors: new Set(pv.map((e) => e.session_id)).size,
    pageviews: pv.length,
    addToCart: atc.length,
    checkoutStarts: co.length,
    orders: ord.length,
    revenue: ord.reduce((s, o) => s + o.total, 0) / 100,
  };
}

/** Top N entries by count from a list of keys, folding anything past N into "Other". Nullish keys
 *  become `fallback` (e.g. "Direct" for no referrer) rather than being dropped. */
function topCounts(keys: (string | null)[], fallback: string, n: number): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k ?? fallback, (counts.get(k ?? fallback) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([label, count]) => ({ label, count }));
  const restCount = sorted.slice(n).reduce((s, [, c]) => s + c, 0);
  if (restCount > 0) top.push({ label: "Other", count: restCount });
  return top;
}

function FunnelRow({ label, value, of, icon: Icon }: { label: string; value: number; of: number; icon: typeof Eye }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
      <span className="w-32 shrink-0 text-sm text-ink-2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-gradient-to-r from-pitch-fill to-pitch-2" style={{ width: `${Math.max(pct ? 2 : 0, pct)}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-ink">{value.toLocaleString()}</span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{of > 0 ? `${pct}%` : "—"}</span>
    </div>
  );
}

/**
 * Traffic, cart and checkout funnel, and the usual business numbers alongside it (owner request
 * 2026-11-03: "make in admin site stats traffic checkout and add to cart how many people visited
 * and all this valuable info"). Built on `site_events` (src/lib/analytics/track.ts writes it,
 * that migration explains why it's anonymous/session-scoped) plus the `orders` table, which
 * already is the real source of truth for the funnel's last step - see that table's own
 * `israelDayStart` convention, reused here for "today" so this page agrees with Overview.
 */
/** Every event in the window, read 1000 at a time (the database returns at most 1000 rows per request). */
async function eventsSince(since: string): Promise<EventRow[]> {
  const out: EventRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data } = await db().from("site_events").select("type,session_id,path,product_handle,referrer_host,created_at")
      .gte("created_at", since).order("created_at", { ascending: true }).order("id").range(from, from + 999);
    out.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default async function Stats({ searchParams }: PageProps<"/admin/stats">) {
  const sp = await searchParams;
  const period = [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400_000).toISOString();
  const todayStart = israelDayStart();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();

  const [events, ordersRes] = await Promise.all([
    eventsSince(since),
    db().from("orders").select("total,confirmed_at,customer:customers(ig_user_id)").gte("confirmed_at", since).not("confirmed_at", "is", null).neq("status", "cancelled"),
  ]);

  // real sales only - test-bot orders (sim: customers) don't count, same filter Overview uses
  const orders = ((ordersRes.data ?? []) as unknown as OrderRow[]).filter((o) => !o.customer?.ig_user_id?.startsWith("sim:"));

  const today = summarize(events, orders, todayStart);
  const last7 = summarize(events, orders, sevenDaysAgo);

  // Daily trend, last TREND_DAYS Israel calendar days.
  const days: { label: string; start: string; end: string }[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    days.push({
      label: d.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short" }).slice(0, 2),
      start: israelDayStart(d),
      end: israelDayEnd(d),
    });
  }
  const pageViewsAll = events.filter((e) => e.type === "page_view");
  const visitorTrend = days.map((d) => ({
    label: d.label,
    value: new Set(pageViewsAll.filter((e) => e.created_at >= d.start && e.created_at <= d.end).map((e) => e.session_id)).size,
  }));

  const last7Events = events.filter((e) => e.created_at >= sevenDaysAgo);
  const topPages = topCounts(last7Events.filter((e) => e.type === "page_view").map((e) => e.path), "(unknown)", 7);
  // Referrer is only ever recorded on a tab's first page_view (see track.ts) - every other
  // row's referrer_host is null and simply isn't "no referrer", it's "not the landing page",
  // so only landing page_views go into this count.
  const landingViews = last7Events.filter((e) => e.type === "page_view");
  const referrerBySession = new Map<string, string | null>();
  for (const e of landingViews) {
    if (!referrerBySession.has(e.session_id)) referrerBySession.set(e.session_id, e.referrer_host);
  }
  const topReferrers = topCounts([...referrerBySession.values()], "Direct / unknown", 6);

  const addToCartByProduct = topCounts(last7Events.filter((e) => e.type === "add_to_cart").map((e) => e.product_handle), "(unknown)", 8)
    .map((row) => {
      if (row.label === "Other" || row.label === "(unknown)") return row;
      const product = getProduct(row.label);
      return { ...row, label: product ? titleFor(product, "en") : row.label };
    });

  const visitors7 = last7.visitors;

  // ---- Sales (admin redesign 2026-11-10): real orders, same definitions as the dashboard (../../metrics.ts)
  const all = await allOrders();
  const pStart = new Date(now.getTime() - period * 86400_000).toISOString();
  const pPrevStart = new Date(now.getTime() - 2 * period * 86400_000).toISOString();
  const cur = summarizeSales(all, pStart);
  const prev = summarizeSales(all.filter((o) => o.confirmed_at && o.confirmed_at < pStart), pPrevStart);
  const series = dailySeries(all, Math.min(period, 90), now);
  const weekly = period > 90;
  const weeks = weekly ? weeklySeries(all, period, now) : null;
  const prodSales = await productSales(cur.sales.map((o) => o.id));
  const methods = new Map<string, number>();
  for (const o of cur.sales) methods.set(o.payment_method ?? "cod", (methods.get(o.payment_method ?? "cod") ?? 0) + o.total);
  const byCustomer = new Map<string, { name: string; spend: number; orders: number }>();
  for (const o of cur.sales) {
    const r = byCustomer.get(o.customer_id) ?? { name: customerName(o), spend: 0, orders: 0 };
    r.spend += o.total; r.orders += 1; byCustomer.set(o.customer_id, r);
  }
  const topCustomers = [...byCustomer.entries()].sort((a, b) => b[1].spend - a[1].spend).slice(0, 6);
  const newBuyers = [...byCustomer.keys()].filter((id) => !all.some((o) => o.customer_id === id && o.confirmed_at && o.confirmed_at < pStart && o.status !== "cancelled")).length;
  const pct = (d: number | null) => d === null ? null : <span className={cx("font-semibold", d >= 0 ? "text-green" : "text-red")}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)}% vs previous {period} days</span>;

  return (
    <>
      <PageHeader eyebrow="Insights" title="Analytics" subtitle="Sales from your orders, plus traffic from the website's own first-party event log (anonymous, session-scoped - not a tracking cookie)." />

      <Tabs active={String(period)} items={[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "12 months"]].map(([d, label]) => ({ key: String(d), label: String(label), href: `/admin/stats?days=${d}` }))} />

      <SectionTitle>Sales · last {period} days</SectionTitle>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Revenue" icon={Wallet} value={ils(cur.revenue)} tone="gold" hint={pct(delta(cur.revenue, prev.revenue)) ?? "Confirmed, not cancelled"} />
        <Kpi label="Orders" icon={Receipt} value={cur.count} hint={pct(delta(cur.count, prev.count)) ?? undefined} />
        <Kpi label="Average order value" icon={CreditCard} value={ils(cur.aov)} tone="gold" hint={prev.count ? `${ils(prev.aov)} the period before` : undefined} />
        <Kpi label="Buyers" icon={UserCheck} value={cur.buyers} tone="green" hint={`${newBuyers} first-time`} />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <ChartCard title={weekly ? "Revenue per week" : "Revenue per day"} figure={ils(cur.revenue)} sub="By the day you confirmed each order (Israel time)">
          <AreaChart data={(weeks ?? series).map((d) => ({ label: d.label, value: d.revenue / 100 }))} format={(v) => `₪${Math.round(v).toLocaleString()}`} />
        </ChartCard>
        <ChartCard title="Payment methods" sub="Share of revenue">
          {methods.size ? <Donut data={[...methods.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => ({ label: METHOD_LABEL[m] ?? m, value: v / 100 }))} format={(v) => `₪${Math.round(v).toLocaleString()}`} /> : <EmptyState icon={CreditCard} title="No sales in this period" />}
        </ChartCard>
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title={weekly ? "Orders per week" : "Orders per day"} figure={cur.count}>
          <BarChart data={(weeks ?? series).map((d) => ({ label: d.label, value: d.orders }))} />
        </ChartCard>
        <ChartCard title="Sales by category" sub="Units sold">
          {prodSales.categories.length ? <Donut data={prodSales.categories} /> : <EmptyState icon={Shirt} title="Nothing sold in this period" />}
        </ChartCard>
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Best-selling products" sub={`${prodSales.shirtsSold} shirts · ${prodSales.accessoriesSold} accessories sold`}>
          <RankList rows={prodSales.best.slice(0, 8).map((b) => ({ label: b.title, value: b.qty, sub: `${b.orders.size} order${b.orders.size === 1 ? "" : "s"}` }))} color="#d4b26a" empty={<EmptyState icon={Shirt} title="Nothing sold in this period" />} />
        </ChartCard>
        <ChartCard title="Top customers" sub="By spend in this period">
          <RankList rows={topCustomers.map(([id, c]) => ({ key: id, label: <Link href={`/admin/customers/${id}`} className="hover:text-pitch" dir="auto">{c.name}</Link>, value: c.spend / 100, sub: `${c.orders} order${c.orders === 1 ? "" : "s"}` }))}
            format={(v) => `₪${v.toLocaleString()}`} empty={<EmptyState icon={Users} title="No buyers in this period" />} />
        </ChartCard>
      </div>

      <div className="kv-eyebrow mb-3">Website traffic</div>

      <SectionTitle>Traffic today</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visitors" value={today.visitors} icon={Users} />
        <Stat label="Page views" value={today.pageviews} icon={Eye} />
        <Stat label="Added to cart" value={today.addToCart} icon={ShoppingCart} />
        <Stat label="Started checkout" value={today.checkoutStarts} icon={CreditCard} />
        <Stat label="Orders" value={today.orders} icon={ShoppingBag} accent hint={`₪${today.revenue.toLocaleString()}`} />
      </div>

      <SectionTitle>Traffic · last 7 days</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visitors" value={last7.visitors} icon={Users} />
        <Stat label="Page views" value={last7.pageviews} icon={Eye} />
        <Stat label="Added to cart" value={last7.addToCart} icon={ShoppingCart} />
        <Stat label="Started checkout" value={last7.checkoutStarts} icon={CreditCard} />
        <Stat label="Orders" value={last7.orders} icon={ShoppingBag} accent hint={`₪${last7.revenue.toLocaleString()}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="flex flex-col gap-6">
          <ChartCard title={`Visitors per day · last ${TREND_DAYS} days`}>
            <BarChart data={visitorTrend} labelEvery={2} />
          </ChartCard>

          <div>
            <SectionTitle>Visit → cart → checkout → order (last 7 days)</SectionTitle>
            {visitors7 === 0 ? (
              <EmptyState icon={TrendingUp} title="No traffic yet" text="Once visitors arrive, the funnel below fills in." />
            ) : (
              <Card>
                <FunnelRow label="Visited" value={visitors7} of={visitors7} icon={Users} />
                <FunnelRow label="Added to cart" value={last7.addToCart} of={visitors7} icon={ShoppingCart} />
                <FunnelRow label="Started checkout" value={last7.checkoutStarts} of={visitors7} icon={CreditCard} />
                <FunnelRow label="Ordered" value={last7.orders} of={visitors7} icon={ShoppingBag} />
              </Card>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div>
            <SectionTitle>Top pages (7 days)</SectionTitle>
            {topPages.length ? (
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {topPages.map((r) => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="truncate font-mono text-xs text-ink-2">{r.label}</span>
                    <span className="shrink-0 tabular-nums text-muted">{r.count.toLocaleString()}</span>
                  </div>
                ))}
              </Card>
            ) : <EmptyState icon={Eye} title="No page views yet" />}
          </div>

          <div>
            <SectionTitle>Where visitors come from (7 days)</SectionTitle>
            {topReferrers.length ? (
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {topReferrers.map((r) => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-1.5 truncate text-ink-2"><Globe className="h-3.5 w-3.5 shrink-0 text-muted" />{r.label}</span>
                    <span className="shrink-0 tabular-nums text-muted">{r.count.toLocaleString()}</span>
                  </div>
                ))}
              </Card>
            ) : <EmptyState icon={Globe} title="No visits yet" />}
          </div>

          <div>
            <SectionTitle>Most added to cart (7 days)</SectionTitle>
            {addToCartByProduct.length ? (
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {addToCartByProduct.map((r) => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="truncate text-ink-2">{r.label}</span>
                    <span className="shrink-0 tabular-nums text-muted">{r.count.toLocaleString()}</span>
                  </div>
                ))}
              </Card>
            ) : <EmptyState icon={ShoppingCart} title="Nothing added to a cart yet" />}
          </div>
        </section>
      </div>
    </>
  );
}

/** Weekly buckets for the 12-month view (7-day blocks ending today). */
function weeklySeries(orders: Awaited<ReturnType<typeof allOrders>>, days: number, now: Date) {
  const daily = dailySeries(orders, days, now);
  const out: { label: string; revenue: number; orders: number }[] = [];
  for (let i = daily.length % 7; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    out.push({ label: chunk[0].label, revenue: chunk.reduce((s, d) => s + d.revenue, 0), orders: chunk.reduce((s, d) => s + d.orders, 0) });
  }
  return out;
}
