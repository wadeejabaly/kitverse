import Link from "next/link";
import { MessagesSquare, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge, EmptyState, Avatar, MODE, cx, timeAgo } from "../../ui";

export const dynamic = "force-dynamic";

const hoursUntil = (iso: string | null) => (iso ? (new Date(iso).getTime() - Date.now()) / 3600_000 : null);

export default async function Inbox({ searchParams }: PageProps<"/admin/inbox">) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "";
  let q = db().from("conversations")
    .select("id,mode,channel,last_customer_msg_at,window_expires_at,customer:customers(full_name,display_name,ig_username),messages(text,direction,created_at)")
    .order("last_customer_msg_at", { ascending: false, nullsFirst: false }).order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" }).limit(60);
  if (filter === "owner") q = q.eq("mode", "owner");
  q = filter === "test" ? q.eq("channel", "simulator") : q.eq("channel", "instagram");
  const { data } = await q;
  const rows = (data ?? []) as unknown as { id: string; mode: string; last_customer_msg_at: string | null; window_expires_at: string | null; customer: { full_name: string | null; display_name: string | null; ig_username: string | null }; messages: { text: string | null; direction: string }[] }[];
  const tabs = [["", "All"], ["owner", "Needs you"], ["test", "Test chats"]];

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every Instagram conversation the bot is handling." />
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1 text-sm">
        {tabs.map(([f, label]) => (
          <Link key={f} href={f ? `/admin/inbox?filter=${f}` : "/admin/inbox"} className={cx("rounded-lg px-3 py-1.5", filter === f ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>{label}</Link>
        ))}
      </div>
      {!rows.length ? <EmptyState icon={MessagesSquare} title="No conversations yet" text="Chats appear here as soon as customers message @kitversejerseys." /> : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {rows.map((c) => {
            const who = c.customer?.full_name ?? c.customer?.display_name ?? c.customer?.ig_username ?? "Customer";
            const h = hoursUntil(c.window_expires_at);
            const last = c.messages?.[0];
            const mode = MODE[c.mode] ?? MODE.bot;
            return (
              <Link key={c.id} href={`/admin/inbox/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-raised sm:px-5">
                <Avatar name={who} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" dir="auto">{who}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(c.last_customer_msg_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-muted" dir="auto">{last ? `${last.direction === "out" ? "↪ " : ""}${last.text ?? "Photo"}` : ""}</p>
                    {h !== null && h > 0 && h < 4 ? <Badge tone="red"><Clock className="h-3 w-3" />{h.toFixed(1)}h</Badge> : null}
                    <Badge tone={mode.tone}>{mode.label}</Badge>
                  </div>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
