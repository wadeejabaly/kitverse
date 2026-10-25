import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, X, Hand, MessagesSquare, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { decideApproval } from "../../../actions";
import { Thread, type ThreadMsg } from "../../thread";
import { PageHeader, Card, Badge, SectionTitle, button, input, KIND } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params, searchParams }: PageProps<"/admin/approvals/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const a = (await db().from("approvals").select("*,conversation:conversations(customer:customers(full_name,display_name,ig_username))").eq("id", id).maybeSingle()).data as
    { id: string; kind: string; status: string; conversation_id: string; draft_reply: string | null; final_reply: string | null; proposal: { summary?: string }; conversation: { customer: { full_name: string | null; display_name: string | null; ig_username: string | null } } | null } | null;
  if (!a) notFound();
  const msgs = ((await db().from("messages").select("id,direction,sender,kind,text,transcript,media,status,created_at")
    .eq("conversation_id", a.conversation_id).in("status", ["received", "sent", "queued", "draft", "failed"])
    .order("created_at", { ascending: false }).limit(16)).data ?? []).reverse() as ThreadMsg[];
  const order = (await db().from("orders").select("number,status,quote").eq("conversation_id", a.conversation_id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data as { number: number; quote: { summaryAr?: string } | null } | null;
  const isDraft = a.kind === "draft_reply";
  const isAvail = a.kind === "availability_check";
  const pending = a.status === "pending";
  const k = KIND[a.kind] ?? KIND.other;
  const c = a.conversation?.customer;
  const who = c?.full_name ?? c?.display_name ?? c?.ig_username ?? "Customer";

  return (
    <>
      <Link href="/admin/approvals" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Approvals</Link>
      <PageHeader
        title={who}
        subtitle={<span className="inline-flex items-center gap-2"><Badge tone={k.tone}>{k.label}</Badge>{!pending ? <span>Decided: {a.status}</span> : null}</span>}
        actions={<Link href={`/admin/inbox/${a.conversation_id}`} className={button.ghost}><MessagesSquare className="h-4 w-4" /> Open chat</Link>}
      />
      {sp.error === "already_decided" ? <p className="mb-3 rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber">This was already decided.</p> : null}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card><SectionTitle>Conversation</SectionTitle><Thread messages={msgs} /></Card>

        <div className="flex flex-col gap-4">
          {order?.quote?.summaryAr ? (
            <Card className="flex items-start gap-3"><Receipt className="mt-0.5 h-4 w-4 text-pitch" /><div className="text-sm"><div className="font-medium">Order #{order.number}</div><div className="mt-0.5 text-ink-2" dir="auto">{order.quote.summaryAr}</div></div></Card>
          ) : null}
          {!isDraft ? (
            <Card><SectionTitle>What the customer wants</SectionTitle><p className="text-sm leading-relaxed text-ink-2" dir="auto">{a.proposal.summary}</p></Card>
          ) : null}

          {pending ? (
            <Card>
              <form action={decideApproval} className="flex flex-col gap-4">
                <input type="hidden" name="approvalId" value={a.id} />
                {isDraft ? (
                  <label className="flex flex-col gap-1.5 text-sm font-medium">Reply the bot wants to send
                    <span className="text-xs font-normal text-muted">Edit it if you like. Blank lines split it into separate messages.</span>
                    <textarea name="text" defaultValue={a.draft_reply ?? ""} rows={7} className={`${input} text-[15px] leading-snug`} dir="auto" />
                  </label>
                ) : (
                  <>
                    {a.draft_reply ? (
                      <label className="flex flex-col gap-1.5 text-sm font-medium">Suggested reply if you approve
                        <textarea name="text" defaultValue={a.draft_reply} rows={3} className={input} dir="auto" />
                      </label>
                    ) : null}
                    <label className="flex flex-col gap-1.5 text-sm font-medium">Note for the bot <span className="text-xs font-normal text-muted">Optional - e.g. price, model, when it arrives. The bot tells the customer.</span>
                      <input name="note" className={input} dir="auto" placeholder={isAvail ? "e.g. available, player version, 7-14 days" : "e.g. ok, 20₪ off this time"} />
                    </label>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <button name="decision" value="approved" className={button.primary}><Check className="h-4 w-4" />{isDraft ? "Send" : isAvail ? "Available" : "Approve"}</button>
                  <button name="decision" value="rejected" className={button.danger}><X className="h-4 w-4" />{isDraft ? "Don't send" : isAvail ? "Not available" : "Reject"}</button>
                  <button name="decision" value="taken_over" className={button.ghost}><Hand className="h-4 w-4" />I&apos;ll reply myself</button>
                </div>
              </form>
            </Card>
          ) : a.final_reply ? <Card><SectionTitle>Your answer</SectionTitle><p className="text-sm" dir="auto">{a.final_reply}</p></Card> : null}
        </div>
      </div>
    </>
  );
}
