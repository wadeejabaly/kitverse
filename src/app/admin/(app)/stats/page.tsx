import { Eye, Users, ShoppingCart, CreditCard, ShoppingBag, TrendingUp, Globe } from "lucide-react";
import { db } from "@/lib/db";
import { getProduct } from "@/data/catalog";
import { titleFor } from "@/lib/product";
import { israelDayStart, israelDayEnd } from "@/lib/time";
import { PageHeader, Card, Stat, SectionTitle, EmptyState } from "../../ui";

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

/** A single-series magnitude bar chart, plain divs - one brand hue, rounded data-end, a thin
 *  gap between bars, exact value on hover via `title` (no legend needed for one series). */
function TrendBars({ data, title: chartTitle }: { data: { label: string; value: number }[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted">{chartTitle}</div>
      <div className="flex h-24 items-end gap-1">
        {data.map((d, i) => (
          <div key={i} className="group relative flex-1" title={`${d.label}: ${d.value.toLocaleString()}`}>
            <div
              className="w-full rounded-t-[3px] bg-pitch-fill transition-colors group-hover:bg-pitch-fill-2"
              style={{ height: `${Math.max(3, Math.round((d.value / max) * 96))}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 text-[10px] text-muted">
        {data.map((d, i) => (
          <div key={i} className="flex-1 truncate text-center">{i % 2 === 0 || data.length <= 8 ? d.label : ""}</div>
        ))}
      </div>
    </div>
  );
}

function FunnelRow({ label, value, of, icon: Icon }: { label: string; value: number; of: number; icon: typeof Eye }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
      <span className="w-32 shrink-0 text-sm text-ink-2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-pitch-fill" style={{ width: `${Math.max(pct ? 2 : 0, pct)}%` }} />
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
export default async function Stats() {
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400_000).toISOString();
  const todayStart = israelDayStart();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();

  const [eventsRes, ordersRes] = await Promise.all([
    db().from("site_events").select("type,session_id,path,product_handle,referrer_host,created_at").gte("created_at", since).order("created_at", { ascending: true }).limit(20000),
    db().from("orders").select("total,confirmed_at,customer:customers(ig_user_id)").gte("confirmed_at", since).not("confirmed_at", "is", null).neq("status", "cancelled"),
  ]);

  const events = (eventsRes.data ?? []) as EventRow[];
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

  return (
    <>
      <PageHeader title="Site stats" subtitle="Traffic, add-to-cart and checkout, from the website's own first-party event log - anonymous and session-scoped, not a tracking cookie." />

      <SectionTitle>Today</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visitors" value={today.visitors} icon={Users} />
        <Stat label="Page views" value={today.pageviews} icon={Eye} />
        <Stat label="Added to cart" value={today.addToCart} icon={ShoppingCart} />
        <Stat label="Started checkout" value={today.checkoutStarts} icon={CreditCard} />
        <Stat label="Orders" value={today.orders} icon={ShoppingBag} accent hint={`₪${today.revenue.toLocaleString()}`} />
      </div>

      <SectionTitle>Last 7 days</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visitors" value={last7.visitors} icon={Users} />
        <Stat label="Page views" value={last7.pageviews} icon={Eye} />
        <Stat label="Added to cart" value={last7.addToCart} icon={ShoppingCart} />
        <Stat label="Started checkout" value={last7.checkoutStarts} icon={CreditCard} />
        <Stat label="Orders" value={last7.orders} icon={ShoppingBag} accent hint={`₪${last7.revenue.toLocaleString()}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="flex flex-col gap-6">
          <Card>
            <TrendBars data={visitorTrend} title={`Visitors per day — last ${TREND_DAYS} days`} />
          </Card>

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
