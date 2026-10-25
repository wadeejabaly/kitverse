import "server-only";
import { db, must } from "../db";
import { sendText, sendImage, InstagramError } from "../channels/instagram";
import { notify } from "../notify";
import type { OutboxItem } from "../agent/tools";
import type { ConversationRow, CustomerRow } from "../agent/state";

/** Store outgoing messages first (status queued/draft), then send. Re-running skips what was already sent. */
export async function queueOutgoing(conv: ConversationRow, outbox: OutboxItem[], opts: { sender: "bot" | "owner"; draft: boolean; runId?: string }) {
  const rows = outbox.map((o, i) => ({
    conversation_id: conv.id, direction: "out", sender: opts.sender, kind: o.type === "image" ? "image" : "text",
    text: o.type === "text" ? o.text : null, media: o.type === "image" ? [{ url: o.url }] : null,
    product_ids: o.type === "image" && o.productId ? [o.productId] : [], status: opts.draft ? "draft" : "queued",
    created_at: new Date(Date.now() + i).toISOString(), // keeps order
  }));
  if (!rows.length) return [] as { id: string }[];
  return must(await db().from("messages").insert(rows).select("id"), "queue outgoing") as { id: string }[];
}

export async function sendQueued(conv: ConversationRow, customer: CustomerRow, opts: { humanAgent?: boolean } = {}) {
  const queued = must(await db().from("messages").select("id,kind,text,media").eq("conversation_id", conv.id).eq("status", "queued")
    .order("created_at"), "queued messages") as { id: string; kind: string; text: string | null; media: { url: string }[] | null }[];
  let sent = 0;
  const failed: string[] = [];
  for (const m of queued) {
    try {
      let mid: string | undefined;
      if (conv.channel === "instagram") {
        const to = customer.ig_user_id!;
        const r = m.kind === "image" ? await sendImage(to, m.media![0].url, opts.humanAgent) : await sendText(to, m.text ?? "", opts.humanAgent);
        mid = r.message_id;
        await new Promise((res) => setTimeout(res, 600)); // natural pacing between bubbles
      }
      must(await db().from("messages").update({ status: "sent", ig_message_id: mid ?? null }).eq("id", m.id).select("id"), "mark sent");
      sent++;
    } catch (e) {
      const terminal = e instanceof InstagramError && (e.notConnected || (e.status >= 400 && e.status < 500 && e.status !== 429));
      if (terminal) {
        await db().from("messages").update({ status: "failed" }).eq("id", m.id);
        failed.push((e as Error).message);
        continue;
      }
      throw e; // transient: let the job retry; already-sent rows stay sent
    }
  }
  if (sent) must(await db().from("conversations").update({ last_bot_msg_at: new Date().toISOString() }).eq("id", conv.id).select("id"), "touch last bot msg");
  if (failed.length) {
    await notify({ kind: "message.failed", priority: "urgent", title: `${failed.length} message(s) not sent`, body: failed[0].slice(0, 160), link: `/admin/inbox/${conv.id}` });
  }
  return sent;
}
