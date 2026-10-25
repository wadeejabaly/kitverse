import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send, Hand, Bot, PencilLine, ShieldOff, Infinity as InfinityIcon, Gauge, Receipt, ClipboardCheck } from "lucide-react";
import { db } from "@/lib/db";
import { conversationAction, ownerSend } from "../../../actions";
import { ChatWindow, Thread, type ThreadMsg } from "../../thread";
import { PageHeader, Card, Badge, SectionTitle, button, input, MODE, KIND, ORDER_STATUS } from "../../../ui";

export const dynamic = "force-dynamic";

const isFuture = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();

export default async function Conversation({ params }: PageProps<"/admin/inbox/[id]">) {
  const { id } = await params;
  const conv = (await db().from("conversations").select("*,customer:customers(*)").eq("id", id).maybeSingle()).data as
    { id: string; mode: string; unlimited_until: string | null; bot_replies_total: number; customer: { full_name: string | null; display_name: string | null; ig_username: string | null; phone: string | null } } | null;
  if (!conv) notFound();
  const msgs = ((await db().from("messages").select("id,direction,sender,kind,text,transcript,media,status,created_at")
    .eq("conversation_id", id).neq("status", "discarded").order("created_at", { ascending: false }).limit(80)).data ?? []).reverse() as ThreadMsg[];
  const pending = (await db().from("approvals").select("id,kind").eq("conversation_id", id).eq("status", "pending")).data ?? [];
  const order = (await db().from("orders").select("id,number,status,quote").eq("conversation_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data as { id: string; number: number; status: string; quote: { summaryAr?: string } | null } | null;
  const who = conv.customer.full_name ?? conv.customer.display_name ?? conv.customer.ig_username ?? "Customer";
  const unlimited = isFuture(conv.unlimited_until);
  const mode = MODE[conv.mode] ?? MODE.bot;
  const act = (action: string, label: string, Icon: typeof Bot, style: string = button.ghost) => (
    <form action={conversationAction}>
      <input type="hidden" name="conversationId" value={conv.id} /><input type="hidden" name="action" value={action} />
      <button className={`${style} w-full justify-start`}><Icon className="h-4 w-4" />{label}</button>
    </form>
  );

  return (
    <>
      <Link href="/admin/inbox" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Inbox</Link>
      <PageHeader title={who} subtitle={<span className="inline-flex items-center gap-2"><Badge tone={mode.tone}>{mode.label}</Badge>{unlimited ? <Badge>No reply limit</Badge> : null}<span>{conv.bot_replies_total} bot replies</span></span>} />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-3">
          {pending.map((p) => (
            <Link key={p.id} href={`/admin/approvals/${p.id}`} className="flex items-center gap-2 rounded-xl bg-amber-soft px-3 py-2.5 text-sm text-amber">
              <ClipboardCheck className="h-4 w-4" /> Waiting for you: {(KIND[p.kind] ?? KIND.other).label}
            </Link>
          ))}
          <Card padded={false}><ChatWindow className="max-h-[max(280px,calc(100dvh-360px))] p-4 sm:p-5"><Thread messages={msgs} /></ChatWindow></Card>
          <form action={ownerSend} className="flex gap-2">
            <input type="hidden" name="conversationId" value={conv.id} />
            <input name="text" required placeholder="Write to the customer…" className={input} dir="auto" autoComplete="off" />
            <button className={button.primary} aria-label="Send"><Send className="h-4 w-4" /></button>
          </form>
          <p className="text-xs text-muted">Writing here (or in Instagram) pauses the bot in this chat for 12 hours.</p>
        </div>

        <div className="flex flex-col gap-4">
          {order ? (
            <Card>
              <SectionTitle action={<Link href={`/admin/orders/${order.id}`} className="text-sm text-link hover:underline">Open</Link>}>Order #{order.number}</SectionTitle>
              <Badge tone={(ORDER_STATUS[order.status] ?? ORDER_STATUS.draft).tone}>{(ORDER_STATUS[order.status] ?? ORDER_STATUS.draft).label}</Badge>
              {order.quote?.summaryAr ? <p className="mt-2 flex gap-2 text-sm text-ink-2" dir="auto"><Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{order.quote.summaryAr}</p> : null}
            </Card>
          ) : null}
          <Card>
            <SectionTitle>Who replies</SectionTitle>
            <div className="flex flex-col gap-2">
              {conv.mode !== "owner" ? act("take_over", "I'll reply (stop the bot)", Hand) : act("hand_back", "Hand back to the bot", Bot, button.primary)}
              {conv.mode === "bot" ? act("draft_mode", "Bot drafts, I approve", PencilLine) : null}
              {conv.mode === "blocked" ? act("unblock", "Unblock", ShieldOff, button.primary) : null}
            </div>
          </Card>
          <Card>
            <SectionTitle>Reply limit</SectionTitle>
            <p className="mb-3 text-xs text-muted">The bot stops after a set number of replies for customers who haven&apos;t bought. Lift it for this chat if it&apos;s a real lead.</p>
            <div className="flex flex-col gap-2">
              {unlimited ? act("limits_normal", "Back to normal limits", Gauge) : (
                <>{act("unlimited_24h", "No limit for 24 hours", Gauge)}{act("unlimited_forever", "No limit, always", InfinityIcon)}</>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
