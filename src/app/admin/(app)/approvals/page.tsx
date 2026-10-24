import Link from "next/link";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge, EmptyState, Avatar, KIND, timeAgo } from "../../ui";

export const dynamic = "force-dynamic";

export default async function Approvals() {
  const { data } = await db().from("approvals")
    .select("id,kind,priority,proposal,draft_reply,created_at,conversation:conversations(id,customer:customers(full_name,display_name,ig_username))")
    .eq("status", "pending").order("created_at");
  const rows = (data ?? []) as unknown as { id: string; kind: string; priority: string; proposal: { summary?: string }; draft_reply: string | null; created_at: string; conversation: { customer: { full_name: string | null; display_name: string | null; ig_username: string | null } } | null }[];
  return (
    <>
      <PageHeader title="Approvals" subtitle="Replies and decisions waiting for you. Oldest first." />
      {!rows.length ? <EmptyState icon={ClipboardCheck} title="All clear" text="When the bot needs you - a reply to approve, a discount, a shirt we may not have - it shows up here and on your phone." /> : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {rows.map((a) => {
            const c = a.conversation?.customer;
            const who = c?.full_name ?? c?.display_name ?? c?.ig_username ?? "Customer";
            const k = KIND[a.kind] ?? KIND.other;
            return (
              <Link key={a.id} href={`/admin/approvals/${a.id}`} className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-raised sm:px-5">
                <Avatar name={who} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" dir="auto">{who}</span>
                    <Badge tone={k.tone}>{k.label}</Badge>
                    <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(a.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-2" dir="auto">{a.kind === "draft_reply" ? a.draft_reply : a.proposal.summary}</p>
                </div>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted" />
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
