import "server-only";
import { db } from "@/lib/db";
import { israelDayStart, israelDayEnd } from "@/lib/time";

/*
 * Business numbers for the dashboard and Analytics (admin redesign 2026-11-10),
 * all from the real orders / order_items / customers tables - no estimates.
 *
 * Definitions (same as the old Overview and Stats pages):
 *  - a SALE is an order the owner confirmed (confirmed_at set) that was not
 *    cancelled, from a real customer (test-bot "sim:" customers never count);
 *  - revenue = the sum of those orders' totals (what the customer pays,
 *    delivery included), in agorot;
 *  - pending = orders waiting for the owner: awaiting confirmation or
 *    awaiting payment verification;
 *  - outstanding = sales not delivered yet (at the supplier, on the way...).
 */

export type OrderLite = {
  id: string; number: number; status: string; source: string | null; total: number; payment_method: string | null; payment_status: string;
  confirmed_at: string | null; created_at: string; customer_id: string; address: { full_name?: string; town?: string; phone?: string } | null;
  customer: { ig_user_id: string | null; full_name: string | null; display_name: string | null; ig_username: string | null } | null;
};

export const PENDING = ["awaiting_confirmation", "awaiting_payment_verification"];

const isTest = (o: OrderLite) => !!o.customer?.ig_user_id?.startsWith("sim:");
export const isSale = (o: OrderLite) => !!o.confirmed_at && o.status !== "cancelled" && !isTest(o);

/** Every order past draft (paged, the API returns at most 1000 rows per request). */
export async function allOrders(): Promise<OrderLite[]> {
  const out: OrderLite[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db().from("orders")
      .select("id,number,status,source,total,payment_method,payment_status,confirmed_at,created_at,customer_id,address,customer:customers(ig_user_id,full_name,display_name,ig_username)")
      .neq("status", "draft").order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw new Error(`orders: ${error.message}`);
    out.push(...((data ?? []) as unknown as OrderLite[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function customerName(o: Pick<OrderLite, "address" | "customer">): string {
  return o.address?.full_name || o.customer?.full_name || o.customer?.display_name || (o.customer?.ig_username ? `@${o.customer.ig_username}` : "") || "Customer";
}

/** The last `days` Israel calendar days, oldest first, with each sale's total bucketed into its confirmation day. */
export function dailySeries(orders: OrderLite[], days: number, now = new Date()) {
  const buckets: { label: string; start: string; end: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    buckets.push({
      label: d.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short" }),
      start: israelDayStart(d), end: israelDayEnd(d), revenue: 0, orders: 0,
    });
  }
  for (const o of orders) {
    if (!isSale(o)) continue;
    const b = buckets.find((x) => o.confirmed_at! >= x.start && o.confirmed_at! <= x.end);
    if (b) { b.revenue += o.total; b.orders += 1; }
  }
  return buckets;
}

export function summarize(orders: OrderLite[], sinceIso?: string) {
  const sales = orders.filter((o) => isSale(o) && (!sinceIso || o.confirmed_at! >= sinceIso));
  const revenue = sales.reduce((s, o) => s + o.total, 0);
  return {
    sales,
    revenue,
    count: sales.length,
    aov: sales.length ? Math.round(revenue / sales.length) : 0,
    buyers: new Set(sales.map((o) => o.customer_id)).size,
  };
}

/** Units sold and best sellers, from the order lines of real sales. */
export async function productSales(saleIds: string[]) {
  const lines: { order_id: string; product_id: string | null; description: string | null; qty: number }[] = [];
  for (let i = 0; i < saleIds.length; i += 200) {
    const { data } = await db().from("order_items").select("order_id,product_id,description,qty").in("order_id", saleIds.slice(i, i + 200));
    lines.push(...((data ?? []) as typeof lines));
  }
  const acc: { order_id: string; category: string; title: string; qty: number }[] = [];
  for (let i = 0; i < saleIds.length; i += 200) {
    const { data } = await db().from("order_accessories").select("order_id,category,title,qty").in("order_id", saleIds.slice(i, i + 200));
    acc.push(...((data ?? []) as typeof acc));
  }
  const ids = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];
  type P = { id: string; title_en: string; handle: string; season: string | null; team: { name_en: string; type: string; league_id: string | null } | null };
  const products = new Map<string, P>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from("products").select("id,title_en,handle,season,team:teams(name_en,type,league_id)").in("id", ids.slice(i, i + 200));
    for (const p of (data ?? []) as unknown as P[]) products.set(p.id, p);
  }
  const byProduct = new Map<string, { title: string; qty: number; orders: Set<string> }>();
  for (const l of lines) {
    const key = l.product_id ?? `desc:${l.description}`;
    const title = (l.product_id && products.get(l.product_id)?.title_en) || l.description || "Shirt";
    const row = byProduct.get(key) ?? { title, qty: 0, orders: new Set<string>() };
    row.qty += l.qty; row.orders.add(l.order_id);
    byProduct.set(key, row);
  }
  // categories: national teams / each club league / retro / accessories
  const byCategory = new Map<string, number>();
  for (const l of lines) {
    const p = l.product_id ? products.get(l.product_id) : undefined;
    const year = Number(p?.season?.match(/\d{4}/)?.[0] ?? 9999);
    const cat = !p ? "Other shirts" : year <= 2023 ? "Retro" : p.team?.type === "national" ? "National teams" : LEAGUE[p.team?.league_id ?? ""] ?? "Other clubs";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + l.qty);
  }
  for (const a of acc) byCategory.set(a.category === "scarf" ? "Scarves" : "Keychains", (byCategory.get(a.category === "scarf" ? "Scarves" : "Keychains") ?? 0) + a.qty);
  return {
    shirtsSold: lines.reduce((s, l) => s + l.qty, 0),
    accessoriesSold: acc.reduce((s, a) => s + a.qty, 0),
    best: [...byProduct.values()].sort((a, b) => b.qty - a.qty || b.orders.size - a.orders.size),
    categories: [...byCategory.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
  };
}

const LEAGUE: Record<string, string> = {
  "premier-league": "Premier League", "la-liga": "La Liga", "serie-a": "Serie A", bundesliga: "Bundesliga", "ligue-1": "Ligue 1",
  "saudi-pro-league": "Saudi Pro League", mls: "MLS", eredivisie: "Eredivisie", "primeira-liga": "Primeira Liga",
};

export const METHOD_LABEL: Record<string, string> = {
  cod: "Cash on delivery", paypal: "PayPal", bit: "Bit (card page)", bit_personal: "Bit transfer", paypal_me: "PayPal.Me",
};

/** % change between two numbers, or null when there is nothing to compare with. */
export function delta(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}
