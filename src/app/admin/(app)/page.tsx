import Link from "next/link";
import { ClipboardCheck, ShoppingBag, Wallet, Cpu, ArrowRight, MessagesSquare, Images, Truck, ImageOff } from "lucide-react";
import { db } from "@/lib/db";
import { israelDayStart } from "@/lib/time";
import { PageHeader, Card, Stat, SectionTitle, Badge, EmptyState, KIND, timeAgo } from "../ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const since = israelDayStart();
  const [spend, pendingCount, pending, webWaiting, orders, ownerChats, recentOrders, noPhoto] = await Promise.all([
    db().rpc("spend_today_usd"),
    db().from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db().from("approvals").select("id,kind,proposal,draft_reply,created_at,conversation:conversations(customer:customers(full_name,display_name,ig_username))").eq("status", "pending").order("created_at").limit(6),
    db().from("orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_confirmation").eq("source", "website"),
    db().from("orders").select("total,customer:customers(ig_user_id)").gte("confirmed_at", since).neq("status", "cancelled"),
    db().from("conversations").select("id,messages(direction,created_at)").eq("mode", "owner").eq("channel", "instagram")
      .order("created_at", { referencedTable: "messages", ascending: false }).limit(1, { referencedTable: "messages" }),
    db().from("orders").select("id,number,total,status,address,confirmed_at").not("confirmed_at", "is", null).order("confirmed_at", { ascending: false }).limit(5),
    db().from("products").select("id", { count: "exact", head: true }).eq("status", "featured").not("photo_status", "in", "(good,owner_upload)"),
  ]);
  // real sales only: test-bot orders (sim: customers) and cancelled orders don't count
  const today = ((orders.data ?? []) as unknown as { total: number; customer: { ig_user_id: string | null } | null }[]).filter((o) => !o.customer?.ig_user_id?.startsWith("sim:"));
  const revenue = today.reduce((s, o) => s + o.total, 0) / 100;
  // chats the owner took over where the customer wrote last (not ones he already answered)
  const needsReply = ((ownerChats.data ?? []) as { messages: { direction: string }[] }[]).filter((c) => c.messages[0]?.direction === "in").length;
  const webOrders = webWaiting.count ?? 0;
  const approvals = (pending.data ?? []) as unknown as { id: string; kind: string; proposal: { summary?: string }; draft_reply: string | null; created_at: string; conversation: { customer: { full_name: string | null; display_name: string | null; ig_username: string | null } } | null }[];

  return (
    <>
      <PageHeader title="Overview" subtitle={new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" })} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting for you" value={(pendingCount.count ?? 0) + webOrders} icon={ClipboardCheck} />
        <Stat label="Orders today" value={today.length} icon={ShoppingBag} />
        <Stat label="Sales today" value={`₪${revenue.toLocaleString()}`} icon={Wallet} />
        <Stat label="AI cost today" value={`$${Number(spend.data ?? 0).toFixed(2)}`} icon={Cpu} />
      </div>

      {webOrders ? (
        <Link href="/admin/orders?status=needs_approval" className="mt-3 flex items-center gap-3 rounded-xl border border-line border-l-[3px] border-l-pitch bg-surface px-4 py-3 text-sm text-ink hover:bg-raised">
          <ShoppingBag className="h-4 w-4 text-pitch" /> {webOrders} website order{webOrders > 1 ? "s" : ""} waiting for your OK <ArrowRight className="ml-auto h-4 w-4 text-muted" />
        </Link>
      ) : null}
      {needsReply ? (
        <Link href="/admin/inbox?filter=owner" className="mt-3 flex items-center gap-3 rounded-xl border border-line border-l-[3px] border-l-pitch bg-surface px-4 py-3 text-sm text-ink hover:bg-raised">
          <MessagesSquare className="h-4 w-4 text-pitch" /> {needsReply} chat{needsReply > 1 ? "s" : ""} waiting for your reply <ArrowRight className="ml-auto h-4 w-4 text-muted" />
        </Link>
      ) : null}
      {noPhoto.count ? (
        <Link href="/admin/photos" className="mt-3 flex items-center gap-3 rounded-xl border border-line border-l-[3px] border-l-amber bg-surface px-4 py-3 text-sm text-ink hover:bg-raised">
          <ImageOff className="h-4 w-4 text-amber" /> {noPhoto.count} website shirts have no photo yet <ArrowRight className="ml-auto h-4 w-4 text-muted" />
        </Link>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionTitle action={<Link href="/admin/approvals" className="text-sm text-link hover:underline">View all</Link>}>Needs your decision</SectionTitle>
          {approvals.length ? (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {approvals.map((a) => {
                const c = a.conversation?.customer;
                const k = KIND[a.kind] ?? KIND.other;
                return (
                  <Link key={a.id} href={`/admin/approvals/${a.id}`} className="flex flex-col gap-1.5 px-4 py-3.5 hover:bg-raised sm:px-5">
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

        <section className="flex flex-col gap-6">
          <div>
            <SectionTitle action={<Link href="/admin/orders" className="text-sm text-link hover:underline">All orders</Link>}>Latest orders</SectionTitle>
            {(recentOrders.data ?? []).length ? (
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {(recentOrders.data ?? []).map((o) => (
                  <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-raised sm:px-5">
                    <span className="font-medium tabular-nums">#{o.number}</span>
                    <span className="truncate text-muted" dir="auto">{(o.address as { full_name?: string } | null)?.full_name ?? ""}</span>
                    <span className="ml-auto font-medium tabular-nums">₪{o.total / 100}</span>
                  </Link>
                ))}
              </Card>
            ) : <EmptyState icon={ShoppingBag} title="No orders yet" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/admin/media" className="group"><Card className="flex h-full flex-col gap-2 group-hover:border-line-2"><Images className="h-5 w-5 text-pitch" strokeWidth={1.75} /><span className="text-sm font-medium">Posts & shirts</span><span className="text-xs text-muted">Confirm which shirts each post shows</span></Card></Link>
            <Link href="/admin/orders/batches" className="group"><Card className="flex h-full flex-col gap-2 group-hover:border-line-2"><Truck className="h-5 w-5 text-pitch" strokeWidth={1.75} /><span className="text-sm font-medium">Supplier batches</span><span className="text-xs text-muted">Sheets to send the supplier</span></Card></Link>
          </div>
        </section>
      </div>
    </>
  );
}
