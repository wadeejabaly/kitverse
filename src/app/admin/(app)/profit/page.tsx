import Link from "next/link";
import { AlertTriangle, Megaphone, Package, PiggyBank, Receipt, Scale, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { isRetroSeason } from "@/data/pricing";
import { israelDayEnd, israelDayStart } from "@/lib/time";
import { missingCosts, orderProfit, parseCosts, parseExpenses, type OrderForProfit, type OrderProfit } from "@/lib/profit/costs";
import { adSpend } from "@/lib/profit/meta-ads";
import { PageHeader, Card, Kpi, SectionTitle, Tabs, Badge, EmptyState, ils, ilTime, cx } from "../../ui";
import { AreaChart, BarChart, ChartCard } from "../../charts";
import { customerName, METHOD_LABEL } from "../../metrics";
import { CostsForm, ExpensesCard } from "./forms";

export const dynamic = "force-dynamic";

/*
 * Profit (owner request 2026-11-13: "see how much I spend [on Meta ads] and calculate net profit for me -
 * I want to see my profit in detail").
 *
 * A sale = an order the owner confirmed, not cancelled, not a test-bot customer (same as the dashboard,
 * src/app/admin/metrics.ts), counted on its confirmation day. Revenue = what the customer pays (order
 * total). Costs = the owner's own numbers ("Your costs" below), per order (src/lib/profit/costs.ts).
 * Ad spend = Meta Marketing API for the same days. Net = revenue - costs - ads - other expenses.
 */

const TZ = "Asia/Jerusalem";
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const addDays = (day: string, n: number) => dayOf(new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000));
const startIso = (day: string) => israelDayStart(new Date(`${day}T12:00:00Z`));
const endIso = (day: string) => israelDayEnd(new Date(`${day}T12:00:00Z`));
const money = (a: number) => (a < 0 ? `−${ils(-a)}` : ils(a === 0 ? 0 : a)); // -0 -> ₪0
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—");

const PERIODS: [string, string][] = [["month", "This month"], ["last_month", "Last month"], ["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["all", "Since the start"]];

function period(key: string, today: string): { since: string; until: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  if (key === "last_month") {
    const lm = new Date(Date.UTC(y, m - 2, 1));
    const since = `${lm.getUTCFullYear()}-${String(lm.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { since, until: addDays(monthStart, -1), label: lm.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  if (key === "7" || key === "30" || key === "90") return { since: addDays(today, -(Number(key) - 1)), until: today, label: `Last ${key} days` };
  if (key === "all") return { since: "2026-08-01", until: today, label: "Since 1 Aug 2026" }; // first ads ran 29 Aug 2026
  return { since: monthStart, until: today, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

type OrderRow = {
  id: string; number: number; status: string; total: number; subtotal: number; delivery_fee: number; discount_total: number;
  payment_method: string | null; payment_status: string; gift_boxes: number | null; confirmed_at: string; customer_id: string;
  address: { full_name?: string; town?: string } | null;
  customer: { ig_user_id: string | null; full_name: string | null; display_name: string | null; ig_username: string | null } | null;
};
type ItemRow = { order_id: string; qty: number; version: string; sleeve: string; print_name: string | null; print_number: string | null; patches: string[] | null; box: boolean; product: { season: string | null; era: string | null } | null };

async function inChunks<T>(ids: string[], load: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const r = await load(ids.slice(i, i + 200));
    if (r.error) throw new Error(r.error.message);
    out.push(...((r.data ?? []) as T[]));
  }
  return out;
}

export default async function ProfitPage({ searchParams }: PageProps<"/admin/profit">) {
  const sp = await searchParams;
  const key = typeof sp.p === "string" && PERIODS.some(([k]) => k === sp.p) ? sp.p : "month";
  const today = dayOf(new Date());
  const { since, until, label } = period(key, today);

  const [settings, ordersRes, ads] = await Promise.all([
    db().from("bot_settings").select("key,value").in("key", ["profit_costs", "profit_expenses"]),
    db().from("orders")
      .select("id,number,status,total,subtotal,delivery_fee,discount_total,payment_method,payment_status,gift_boxes,confirmed_at,customer_id,address,customer:customers(ig_user_id,full_name,display_name,ig_username)")
      .not("confirmed_at", "is", null).neq("status", "cancelled").gte("confirmed_at", startIso(since)).lte("confirmed_at", endIso(until))
      .order("confirmed_at", { ascending: false }).limit(5000),
    adSpend(since, until),
  ]);
  if (ordersRes.error) throw new Error(ordersRes.error.message);
  const setting = (k: string) => (settings.data ?? []).find((r) => r.key === k)?.value;
  const costs = parseCosts(setting("profit_costs"));
  const allExpenses = parseExpenses(setting("profit_expenses"));
  const expenses = allExpenses.filter((e) => e.date >= since && e.date <= until);
  const missing = missingCosts(costs);

  const orders = ((ordersRes.data ?? []) as unknown as OrderRow[]).filter((o) => !o.customer?.ig_user_id?.startsWith("sim:"));
  const ids = orders.map((o) => o.id);
  const [items, accessories] = await Promise.all([
    inChunks<ItemRow>(ids, (c) => db().from("order_items").select("order_id,qty,version,sleeve,print_name,print_number,patches,box,product:products(season,era)").in("order_id", c)),
    inChunks<{ order_id: string; category: string; qty: number }>(ids, (c) => db().from("order_accessories").select("order_id,category,qty").in("order_id", c)),
  ]);

  const rows = orders.map((o) => {
    const input: OrderForProfit = {
      id: o.id, number: o.number, total: o.total, subtotal: o.subtotal, delivery_fee: o.delivery_fee, discount_total: o.discount_total,
      payment_method: o.payment_method, gift_boxes: o.gift_boxes ?? 0,
      items: items.filter((i) => i.order_id === o.id).map((i) => ({
        qty: i.qty, version: i.version, sleeve: i.sleeve,
        retro: i.product?.era === "retro" || (!!i.product?.season && isRetroSeason(i.product.season)),
        print: !!(i.print_name || i.print_number), patches: (i.patches ?? []).length, box: i.box,
      })),
      accessories: accessories.filter((a) => a.order_id === o.id),
    };
    return { o, p: orderProfit(input, costs) };
  });

  const sum = (f: (p: OrderProfit) => number) => rows.reduce((s, r) => s + f(r.p), 0);
  const revenue = sum((p) => p.revenue);
  const productCost = sum((p) => p.productCost), customisation = sum((p) => p.customisationCost), extras = sum((p) => p.extrasCost);
  const supplierShipping = sum((p) => p.supplierShipping), delivery = sum((p) => p.delivery), fees = sum((p) => p.paymentFee);
  const orderCosts = sum((p) => p.totalCost);
  const gross = revenue - orderCosts;
  const adTotal = ads.ok ? ads.total : 0;
  const otherTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const net = gross - adTotal - otherTotal;
  const n = rows.length;
  const shirts = sum((p) => p.shirts);
  const deliveryCollected = orders.reduce((s, o) => s + o.delivery_fee, 0);
  const discounts = orders.reduce((s, o) => s + o.discount_total, 0);
  const notCollected = rows.filter((r) => r.o.payment_status !== "paid" && r.o.status !== "delivered").reduce((s, r) => s + r.o.total, 0);

  // per day: revenue and ad spend
  const days: string[] = [];
  for (let d = since; d <= until && days.length < 400; d = addDays(d, 1)) days.push(d);
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const revByDay = new Map<string, number>();
  for (const r of rows) { const d = dayOf(new Date(r.o.confirmed_at)); revByDay.set(d, (revByDay.get(d) ?? 0) + r.o.total); }
  const revenueSeries = days.map((d) => ({ label: dayLabel(d), value: (revByDay.get(d) ?? 0) / 100 }));
  const adSeries = days.map((d) => ({ label: dayLabel(d), value: ((ads.ok ? ads.daily[d] : 0) ?? 0) / 100 }));
  const shek = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;

  const waterfall: { label: string; amount: number; strong?: boolean; hint?: string }[] = [
    { label: "Revenue (what customers pay)", amount: revenue, strong: true, hint: `${n} order${n === 1 ? "" : "s"} · ${shirts} shirt${shirts === 1 ? "" : "s"}` },
    { label: "Shirts from the supplier", amount: -productCost },
    { label: "Names, numbers & patches", amount: -customisation },
    { label: "Gift boxes, scarves & keychains", amount: -extras },
    { label: "Shipping from the supplier", amount: -supplierShipping },
    { label: "Delivery to customers", amount: -delivery },
    { label: "Payment & collection fees", amount: -fees },
    { label: "Gross profit", amount: gross, strong: true },
    { label: "Meta ads", amount: -adTotal, hint: ads.ok ? undefined : "not connected" },
    { label: "Other expenses", amount: -otherTotal, hint: expenses.length ? `${expenses.length} item${expenses.length === 1 ? "" : "s"}` : undefined },
    { label: "Net profit", amount: net, strong: true },
  ];

  return (
    <>
      <PageHeader eyebrow="Insights" title="Profit" subtitle={`${label} · ${since === until ? dayLabel(since) : `${dayLabel(since)} – ${dayLabel(until)}`}. Confirmed sales minus your costs, Meta ad spend and other expenses.`} />
      <Tabs active={key} items={PERIODS.map(([k, l]) => ({ key: k, href: `/admin/profit?p=${k}`, label: l }))} />

      {missing.length ? (
        <div className="kv-card mb-4 flex items-start gap-3 border-l-[3px] border-l-amber px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <span className="text-ink-2">Profit is too high until you fill in your costs - still empty: <b className="text-ink">{missing.join(", ")}</b>. <a href="#costs" className="font-semibold text-link hover:underline">Fill them in below</a>.</span>
        </div>
      ) : null}
      {!ads.ok ? (
        <div className="kv-card mb-4 flex items-start gap-3 border-l-[3px] border-l-amber px-4 py-3 text-sm">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <span className="text-ink-2">
            {ads.reason === "not_connected"
              ? <>Meta Ads isn&apos;t connected yet, so ad spend counts as ₪0. It needs a Meta token with <b className="text-ink">ads_read</b> for ad account 1754697569205817 (set as <code>META_ADS_ACCESS_TOKEN</code> and <code>META_AD_ACCOUNT_ID</code> in Vercel). Until then you can add ad spend under Other expenses.</>
              : <>Couldn&apos;t read Meta ad spend: {ads.message}</>}
          </span>
        </div>
      ) : ads.currency !== "ILS" ? (
        <div className="kv-card mb-4 px-4 py-3 text-sm text-amber">The ad account is in {ads.currency}, not shekels - ad spend below is in {ads.currency} and not converted.</div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Revenue" value={ils(revenue)} icon={ShoppingBag} hint={`${n} sale${n === 1 ? "" : "s"} · avg ${n ? ils(Math.round(revenue / n)) : "—"}`} />
        <Kpi label="Costs (shirts, delivery, fees)" value={ils(orderCosts)} icon={Package} tone="amber" hint={`${pct(orderCosts, revenue)} of revenue`} />
        <Kpi label="Meta ads" value={ads.ok ? ils(adTotal) : "—"} icon={Megaphone} tone="gold" hint={ads.ok ? (n ? `${ils(Math.round(adTotal / n))} per sale · ROAS ${adTotal ? (revenue / adTotal).toFixed(1) : "—"}x` : "no sales in this period") : "not connected"} />
        <Kpi label="Net profit" value={money(net)} icon={PiggyBank} tone={net >= 0 ? "green" : "red"} hint={`margin ${pct(net, revenue)} · ${n ? money(Math.round(net / n)) : "—"} per sale`} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <SectionTitle><span className="inline-flex items-center gap-2"><Scale className="h-3.5 w-3.5" /> Where the money goes</span></SectionTitle>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {waterfall.map((w) => (
                <tr key={w.label} className={cx("border-b border-line/60 last:border-0", w.strong && "font-bold")}>
                  <td className={cx("py-2 pe-3", w.strong ? "text-ink" : "text-ink-2")}>{w.label}{w.hint ? <span className="ms-2 text-xs font-normal text-muted">{w.hint}</span> : null}</td>
                  <td className={cx("py-2 text-end tabular-nums", w.strong ? (w.amount < 0 ? "text-red" : "text-ink") : "text-muted")}>{money(w.amount)}</td>
                  <td className="w-16 py-2 text-end text-xs tabular-nums text-muted">{w.label.startsWith("Revenue") ? "" : pct(Math.abs(w.amount), revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Revenue includes {ils(deliveryCollected)} delivery fees paid by customers, after {ils(discounts)} of discounts.
            {notCollected ? <> {ils(notCollected)} of it isn&apos;t paid yet (cash on delivery, not delivered).</> : null}
          </p>
        </Card>

        <div className="grid content-start gap-4">
          <ChartCard title="Sales per day" figure={ils(revenue)}>
            <AreaChart data={revenueSeries} format={shek} />
          </ChartCard>
          <ChartCard title="Meta ad spend per day" figure={ads.ok ? ils(adTotal) : "—"}>
            {ads.ok ? <BarChart data={adSeries} format={shek} color="#d4b26a" /> : <p className="text-sm text-muted">Shown once Meta Ads is connected.</p>}
          </ChartCard>
        </div>
      </div>

      {ads.ok && ads.campaigns.length ? (
        <Card className="mb-5" padded={false}>
          <div className="p-4 pb-0 sm:p-5 sm:pb-0"><SectionTitle><span className="inline-flex items-center gap-2"><Megaphone className="h-3.5 w-3.5" /> Campaigns</span></SectionTitle></div>
          <div className="overflow-x-auto">
            <table className="kv-adm-table">
              <thead><tr><th>Campaign</th><th className="text-end">Spend</th><th className="text-end">DM conversations</th><th className="text-end">Per conversation</th><th className="hidden text-end md:table-cell">Clicks</th><th className="hidden text-end md:table-cell">Impressions</th></tr></thead>
              <tbody>
                {ads.campaigns.map((c) => (
                  <tr key={c.id || c.name}>
                    <td className="max-w-[260px] truncate text-ink">{c.name}</td>
                    <td className="text-end font-semibold tabular-nums">{ils(c.spend)}</td>
                    <td className="text-end tabular-nums">{c.conversations || "—"}</td>
                    <td className="text-end tabular-nums">{c.conversations ? ils(Math.round(c.spend / c.conversations)) : "—"}</td>
                    <td className="hidden text-end tabular-nums md:table-cell">{c.clicks.toLocaleString("en-US")}</td>
                    <td className="hidden text-end tabular-nums md:table-cell">{c.impressions.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="mb-5" padded={false}>
        <div className="p-4 pb-0 sm:p-5 sm:pb-0"><SectionTitle><span className="inline-flex items-center gap-2"><Receipt className="h-3.5 w-3.5" /> Profit per order</span></SectionTitle></div>
        {!rows.length ? <div className="p-4"><EmptyState icon={TrendingUp} title="No sales in this period" text="Confirmed orders show up here." /></div> : (
          <div className="overflow-x-auto">
            <table className="kv-adm-table">
              <thead><tr><th>Order</th><th>Customer</th><th className="hidden md:table-cell">Payment</th><th className="text-end">Revenue</th><th className="hidden text-end lg:table-cell">Shirts & extras</th><th className="hidden text-end lg:table-cell">Shipping & delivery</th><th className="hidden text-end lg:table-cell">Fees</th><th className="text-end">Profit</th><th className="text-end">Margin</th></tr></thead>
              <tbody>
                {rows.map(({ o, p }) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink hover:text-pitch">#{o.number}</Link><div className="text-[11px] text-muted">{ilTime(o.confirmed_at)}</div></td>
                    <td className="max-w-[200px] truncate text-ink-2" dir="auto">{customerName(o)}</td>
                    <td className="hidden whitespace-nowrap text-muted md:table-cell">{METHOD_LABEL[o.payment_method ?? "cod"] ?? o.payment_method}{o.payment_status === "paid" ? <Badge tone="green" className="ms-1.5">paid</Badge> : null}</td>
                    <td className="text-end tabular-nums">{ils(p.revenue)}</td>
                    <td className="hidden text-end tabular-nums text-muted lg:table-cell">{ils(p.productCost + p.customisationCost + p.extrasCost)}</td>
                    <td className="hidden text-end tabular-nums text-muted lg:table-cell">{ils(p.supplierShipping + p.delivery)}</td>
                    <td className="hidden text-end tabular-nums text-muted lg:table-cell">{ils(p.paymentFee)}</td>
                    <td className={cx("text-end font-semibold tabular-nums", p.profit < 0 ? "text-red" : "text-ink")}>{money(p.profit)}</td>
                    <td className="text-end text-xs tabular-nums text-muted">{pct(p.profit, p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 pb-4 pt-2 text-xs text-muted sm:px-5">Per-order profit is before ads and other expenses (those are for the whole period, in the box above).</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div id="costs" className="scroll-mt-24"><CostsForm costs={costs} /></div>
        <ExpensesCard expenses={allExpenses.slice(0, 60)} today={today} periodTotal={otherTotal} periodLabel={label} icon={<Wallet className="h-3.5 w-3.5" />} />
      </div>
    </>
  );
}
