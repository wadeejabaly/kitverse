import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, AtSign, MessagesSquare, Wallet, Receipt, CreditCard, CalendarClock, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Card, SectionTitle, Badge, Avatar, Kpi, EmptyState, KV, ORDER_STATUS, MODE, button, ils, ilTime, payLabel } from "../../../ui";
import { isSale, type OrderLite } from "../../../metrics";
import { displayName, type CustomerRow } from "../data";

export const dynamic = "force-dynamic";

/** One customer: contact details, what they've bought and spent, every order, and their Instagram chat. Read-only. */
export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const c = (await db().from("customers").select("id,full_name,display_name,ig_username,ig_user_id,phone,phone_alt,email,preferred_language,created_at,is_blocked,tags,notes").eq("id", id).maybeSingle()).data as
    (CustomerRow & { phone_alt: string | null; preferred_language: string | null; notes: string | null }) | null;
  if (!c) notFound();
  const [ordersRes, convRes] = await Promise.all([
    db().from("orders").select("id,number,status,source,total,payment_method,payment_status,confirmed_at,created_at,customer_id,address").eq("customer_id", id).neq("status", "draft").order("created_at", { ascending: false }),
    db().from("conversations").select("id,mode,last_message_at,channel").eq("customer_id", id).order("last_message_at", { ascending: false }).limit(3),
  ]);
  const orders = ((ordersRes.data ?? []) as unknown as OrderLite[]).map((o) => ({ ...o, customer: { ig_user_id: c.ig_user_id, full_name: c.full_name, display_name: c.display_name, ig_username: c.ig_username } }));
  const sales = orders.filter(isSale);
  const spend = sales.reduce((s, o) => s + o.total, 0);
  const convs = (convRes.data ?? []) as { id: string; mode: string; last_message_at: string | null; channel: string }[];
  const lastAddress = orders.find((o) => o.address)?.address as (Record<string, string | null> | undefined);
  const name = displayName(c);
  const lang = { ar: "Arabic", he: "Hebrew", en: "English" }[c.preferred_language ?? ""] ?? null;

  return (
    <>
      <Link href="/admin/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      <PageHeader eyebrow="Customer" title={name}
        subtitle={<span className="mt-1 inline-flex flex-wrap items-center gap-2">{c.ig_user_id ? <Badge tone="blue"><AtSign className="h-3 w-3" />Instagram</Badge> : <Badge>Website</Badge>}{c.is_blocked ? <Badge tone="red">Blocked</Badge> : null}{(c.tags ?? []).map((t) => <Badge key={t}>{t}</Badge>)}<span>Customer since {ilTime(c.created_at).split(",")[0]}</span></span>}
        actions={convs[0] ? <Link href={`/admin/inbox/${convs[0].id}`} className={button.primary}><MessagesSquare className="h-4 w-4" /> Open chat</Link> : undefined} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Orders" icon={Receipt} value={sales.length} hint={orders.length > sales.length ? `${orders.length - sales.length} more not confirmed / cancelled` : "Confirmed orders"} />
        <Kpi label="Total spent" icon={Wallet} value={ils(spend)} tone="gold" />
        <Kpi label="Average order" icon={CreditCard} value={ils(sales.length ? Math.round(spend / sales.length) : 0)} tone="gold" />
        <Kpi label="Last order" icon={CalendarClock} value={orders[0] ? ilTime(orders[0].confirmed_at ?? orders[0].created_at).split(",")[0] : "—"} tone="green" hint={orders[0] ? `#${orders[0].number}` : "No orders yet"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="kv-card overflow-hidden">
          <div className="px-5 pb-2 pt-5"><h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Order history</h2></div>
          {orders.length ? (
            <div className="overflow-x-auto">
              <table className="kv-adm-table">
                <thead><tr><th>Order</th><th>Date</th><th className="hidden sm:table-cell">Payment</th><th>Status</th><th className="text-end">Total</th></tr></thead>
                <tbody>
                  {orders.map((o) => {
                    const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.draft;
                    return (
                      <tr key={o.id}>
                        <td><Link href={`/admin/orders/${o.id}`} className="font-semibold text-ink hover:text-pitch">#{o.number}</Link><div className="text-[11px] text-muted">{o.source === "website" ? "Website" : "Instagram"}</div></td>
                        <td className="whitespace-nowrap text-muted">{ilTime(o.confirmed_at ?? o.created_at)}</td>
                        <td className="hidden text-muted sm:table-cell">{payLabel(o.payment_method, o.payment_status)}</td>
                        <td><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className="text-end font-semibold tabular-nums">{ils(o.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="p-5"><EmptyState icon={Receipt} title="No orders yet" /></div>}
        </section>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={name} size={46} />
              <div className="min-w-0"><div className="truncate font-semibold" dir="auto">{name}</div>{c.ig_username ? <div className="text-xs text-muted">@{c.ig_username}</div> : null}</div>
            </div>
            <SectionTitle>Contact</SectionTitle>
            <div className="flex flex-col gap-2.5 text-sm">
              {c.phone ? <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-ink-2 hover:text-ink"><Phone className="h-4 w-4 text-muted" /><span dir="ltr" className="tabular-nums">{c.phone}</span>{c.phone_alt ? <span className="text-muted" dir="ltr">/ {c.phone_alt}</span> : null}</a> : null}
              {c.email ? <a href={`mailto:${c.email}`} className="flex items-center gap-2 truncate text-ink-2 hover:text-ink"><Mail className="h-4 w-4 shrink-0 text-muted" />{c.email}</a> : null}
              {c.ig_username ? <a href={`https://instagram.com/${c.ig_username}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink-2 hover:text-ink"><AtSign className="h-4 w-4 text-muted" />@{c.ig_username}</a> : null}
              {lastAddress ? <div className="flex items-start gap-2 text-ink-2" dir="auto"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{[lastAddress.town, lastAddress.street, lastAddress.house_number].filter(Boolean).join("، ")}</div> : null}
              {!c.phone && !c.email && !c.ig_username ? <p className="text-muted">No contact details saved.</p> : null}
            </div>
            <div className="mt-4 divide-y divide-line border-t border-line">
              {lang ? <KV label="Language">{lang}</KV> : null}
              <KV label="Spent">{ils(spend)}</KV>
              <KV label="Orders">{sales.length}</KV>
            </div>
            {c.notes ? <p className="mt-3 rounded-xl bg-raised/60 px-3 py-2 text-sm text-ink-2" dir="auto">{c.notes}</p> : null}
          </Card>
          <Card>
            <SectionTitle>Instagram chat</SectionTitle>
            {convs.length ? (
              <div className="flex flex-col gap-2">
                {convs.map((cv) => (
                  <Link key={cv.id} href={`/admin/inbox/${cv.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm hover:border-line-2 hover:bg-raised/50">
                    <span className="flex items-center gap-2"><MessagesSquare className="h-4 w-4 text-pitch" />Conversation</span>
                    <span className="flex items-center gap-2"><Badge tone={(MODE[cv.mode] ?? MODE.bot).tone}>{(MODE[cv.mode] ?? MODE.bot).label}</Badge>{cv.last_message_at ? <span className="text-xs text-muted">{ilTime(cv.last_message_at)}</span> : null}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="text-sm text-muted">No Instagram conversation.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
