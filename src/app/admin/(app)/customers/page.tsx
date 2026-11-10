import Link from "next/link";
import { Users, Search, Filter, AtSign, Globe, Wallet, Receipt, UserCheck } from "lucide-react";
import { PageHeader, EmptyState, Avatar, Badge, Kpi, button, input, ils, ilTime, Tabs } from "../../ui";
import { allOrders, isSale } from "../../metrics";
import { allCustomers, displayName } from "./data";

export const dynamic = "force-dynamic";

/**
 * Customers (admin redesign 2026-11-10): everyone who wrote on Instagram or
 * ordered on the website, with their orders and spend - read-only, straight
 * from the customers and orders tables. Spend counts only real sales
 * (confirmed, not cancelled), the same definition as the dashboard.
 */
export default async function Customers({ searchParams }: PageProps<"/admin/customers">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const q = str("q"), type = str("type") || "all", sort = str("sort") || "recent";

  const [customers, orders] = await Promise.all([allCustomers(), allOrders()]);
  const stats = new Map<string, { orders: number; spend: number; last: string | null; open: number }>();
  for (const o of orders) {
    const s = stats.get(o.customer_id) ?? { orders: 0, spend: 0, last: null, open: 0 };
    if (isSale(o)) { s.orders += 1; s.spend += o.total; }
    if (!["cancelled", "delivered", "quoted"].includes(o.status)) s.open += 1;
    const at = o.confirmed_at ?? o.created_at;
    if (!s.last || at > s.last) s.last = at;
    stats.set(o.customer_id, s);
  }
  const st = (id: string) => stats.get(id) ?? { orders: 0, spend: 0, last: null, open: 0 };

  let rows = customers;
  if (type === "buyers") rows = rows.filter((c) => st(c.id).orders > 0);
  else if (type === "repeat") rows = rows.filter((c) => st(c.id).orders > 1);
  else if (type === "no_orders") rows = rows.filter((c) => st(c.id).orders === 0);
  else if (type === "instagram") rows = rows.filter((c) => !!c.ig_user_id);
  else if (type === "website") rows = rows.filter((c) => !c.ig_user_id);
  if (q) {
    const needle = q.toLowerCase().replace(/^@/, ""), digits = q.replace(/\D/g, "");
    rows = rows.filter((c) => [c.full_name, c.display_name, c.ig_username, c.email].some((v) => v?.toLowerCase().includes(needle)) || (digits.length >= 4 && (c.phone ?? "").replace(/\D/g, "").includes(digits)));
  }
  rows = [...rows].sort((a, b) =>
    sort === "spend" ? st(b.id).spend - st(a.id).spend
      : sort === "orders" ? st(b.id).orders - st(a.id).orders
        : (st(b.id).last ?? b.created_at) > (st(a.id).last ?? a.created_at) ? 1 : -1);

  const buyers = customers.filter((c) => st(c.id).orders > 0);
  const repeat = customers.filter((c) => st(c.id).orders > 1).length;
  const spendAll = buyers.reduce((s, c) => s + st(c.id).spend, 0);
  const keep = (extra: Record<string, string>) => `/admin/customers?${new URLSearchParams(Object.entries({ q, type, sort, ...extra }).filter(([, v]) => v && v !== "all"))}`;

  return (
    <>
      <PageHeader eyebrow="Sales" title="Customers" subtitle="Everyone who wrote on Instagram or ordered on the website. Spend counts confirmed orders that weren't cancelled." />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Customers" icon={Users} value={customers.length.toLocaleString()} hint="Test-bot chats excluded" />
        <Kpi label="Have bought" icon={UserCheck} value={buyers.length.toLocaleString()} tone="green" hint={customers.length ? `${Math.round((buyers.length / customers.length) * 100)}% of customers` : undefined} />
        <Kpi label="Repeat buyers" icon={Receipt} value={repeat} tone="gold" hint="2 or more orders" />
        <Kpi label="Spend per buyer" icon={Wallet} value={ils(buyers.length ? Math.round(spendAll / buyers.length) : 0)} tone="gold" hint={`${ils(spendAll)} in total`} />
      </div>

      <Tabs active={type} items={[["all", "All"], ["buyers", "Buyers"], ["repeat", "Repeat"], ["no_orders", "No orders"], ["instagram", "Instagram"], ["website", "Website only"]].map(([k, label]) => ({ key: k, label, href: keep({ type: k }) }))} />

      <form method="get" action="/admin/customers" className="kv-card mb-4 flex flex-wrap items-end gap-3 p-3">
        <input type="hidden" name="type" value={type} />
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Search
          <span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Name, phone, email or @instagram" className={`${input} h-10 pl-9 normal-case tracking-normal`} /></span>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Sort by
          <select name="sort" defaultValue={sort} className={`${input} h-10 py-0 normal-case tracking-normal`}>
            <option value="recent">Most recent</option><option value="spend">Highest spend</option><option value="orders">Most orders</option>
          </select>
        </label>
        <button className={`${button.primary} h-10`}><Filter className="h-4 w-4" /> Apply</button>
        {q || sort !== "recent" ? <Link href={keep({ q: "", sort: "" })} className={`${button.subtle} h-10`}>Clear</Link> : null}
      </form>

      <p className="mb-3 text-sm text-muted">{rows.length} customer{rows.length === 1 ? "" : "s"}</p>
      {!rows.length ? <EmptyState icon={Users} title="No customers here" text={q ? "Nothing matches this search." : undefined} /> : (
        <div className="kv-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="kv-adm-table">
              <thead><tr><th>Customer</th><th className="hidden md:table-cell">Contact</th><th className="hidden sm:table-cell">Channel</th><th className="text-end">Orders</th><th className="text-end">Spent</th><th className="hidden lg:table-cell">Last activity</th></tr></thead>
              <tbody>
                {rows.slice(0, 400).map((c) => {
                  const s = st(c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-3">
                          <Avatar name={displayName(c)} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink hover:text-pitch" dir="auto">{displayName(c)}</span>
                            <span className="block text-[11px] text-muted">Since {ilTime(c.created_at).split(",")[0]}{c.is_blocked ? " · blocked" : ""}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden md:table-cell"><div className="tabular-nums text-ink-2" dir="ltr">{c.phone ?? "—"}</div>{c.email ? <div className="truncate text-[11px] text-muted">{c.email}</div> : null}</td>
                      <td className="hidden sm:table-cell">{c.ig_user_id ? <Badge tone="blue"><AtSign className="h-3 w-3" />{c.ig_username ? `@${c.ig_username}` : "Instagram"}</Badge> : <Badge><Globe className="h-3 w-3" />Website</Badge>}</td>
                      <td className="text-end tabular-nums">{s.orders || <span className="text-muted">0</span>}{s.open ? <div className="text-[11px] text-gold">{s.open} open</div> : null}</td>
                      <td className="text-end font-semibold tabular-nums">{s.spend ? ils(s.spend) : <span className="font-normal text-muted">—</span>}</td>
                      <td className="hidden whitespace-nowrap text-muted lg:table-cell">{s.last ? ilTime(s.last) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {rows.length > 400 ? <p className="mt-2 text-xs text-muted">Showing 400 - search to find others.</p> : null}
    </>
  );
}
