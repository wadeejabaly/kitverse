import "server-only";
import { db, must } from "../db";
import { runAgent, type AgentResult } from "../agent/run";
import { createApproval } from "../approvals";
import { notify } from "../notify";
import { transcribe } from "../stt";
import { botOn, checkGate, settings } from "./limits";
import { turnBlocker } from "./gate";
import { queueOutgoing, sendQueued } from "./deliver";
import { senderAction } from "../channels/instagram";
import type { ConversationRow, CustomerRow } from "../agent/state";

export interface TurnResult {
  status: "skipped" | "gated" | "sent" | "drafted" | "no_reply" | "error";
  reason?: string;
  outcome?: AgentResult["outcome"];
  costUsd?: number;
  quoteSent?: boolean;
  bubbles?: string[];
}

const label = (c: CustomerRow) => c.full_name ?? c.display_name ?? c.ig_username ?? "Customer";

async function load(conversationId: string) {
  const conv = must(await db().from("conversations").select("*").eq("id", conversationId).single(), "conversation") as ConversationRow;
  const customer = must(await db().from("customers").select("*").eq("id", conv.customer_id).single(), "customer") as CustomerRow;
  return { conv, customer };
}

/** Transcribe voice notes that arrived since the last turn (no provider -> left for the owner). */
async function transcribePending(convId: string) {
  const audio = must(await db().from("messages").select("id,media").eq("conversation_id", convId).eq("kind", "audio").is("transcript", null).eq("status", "received"), "audio") as { id: string; media: { url?: string }[] | null }[];
  let failed = 0;
  for (const m of audio) {
    const url = m.media?.[0]?.url;
    const buf = url ? Buffer.from(await (await fetch(url)).arrayBuffer()) : null;
    const t = buf ? await transcribe(buf).catch(() => null) : null;
    if (t) await db().from("messages").update({ transcript: t.text }).eq("id", m.id); else failed++;
  }
  return failed;
}

const CLOSING_LINE: Record<string, string> = {
  rate_limit: "خليني اشوف واحكيلك 🙏",
  lifetime_review: "خليني اشوف واحكيلك 🙏",
};

/**
 * One bot turn for a conversation: gate -> preprocess -> agent -> deliver (or draft for approval).
 * Safe to call repeatedly; the job runner serialises calls per conversation.
 */
export async function processConversation(conversationId: string, opts: { extraSystem?: string } = {}): Promise<TurnResult> {
  const { conv, customer } = await load(conversationId);
  const blocked = turnBlocker(conv, conv.channel === "instagram" ? await botOn() : true, new Date());
  if (blocked) return { status: "skipped", reason: blocked };
  if (["owner", "paused"].includes(conv.mode)) { // a timed owner pause that has run out: the bot takes the chat back
    const autonomy = await settings<{ mode: string }>("autonomy", { mode: "draft" });
    conv.mode = autonomy.mode === "auto" ? "bot" : "draft";
    await db().from("conversations").update({ mode: conv.mode, mode_until: null }).eq("id", conv.id);
  }

  const gate = await checkGate(conv);
  if (!gate.ok) {
    if (gate.reason === "spam") {
      await db().from("conversations").update({ mode: "blocked", spam_blocked_at: new Date().toISOString() }).eq("id", conv.id);
      await notify({ kind: "conversation.spam", priority: "quiet", title: `Spam blocked - ${label(customer)}`, link: `/admin/inbox/${conv.id}` });
    } else if (gate.reason === "spend_stop") {
      await notify({ kind: "bot.spend_stop", priority: "urgent", title: "Bot paused: daily AI spend cap reached", body: "All chats are waiting for you. You can lift the cap in Settings.", link: `/admin/inbox/${conv.id}` });
    } else {
      await queueOutgoing(conv, [{ type: "text", text: CLOSING_LINE[gate.reason] }], { sender: "bot", draft: false });
      await sendQueued(conv, customer).catch(() => 0);
      await db().from("conversations").update({ mode: "owner", mode_until: null }).eq("id", conv.id);
      await notify({ kind: "conversation.rate_limit", priority: "normal", title: `Long chat, no purchase - ${label(customer)}`, body: "The bot stopped and handed it to you. Reply yourself or lift the limit for this chat.", link: `/admin/inbox/${conv.id}` });
    }
    return { status: "gated", reason: gate.reason };
  }

  // auto mode: the customer sees "seen" + typing right away instead of silence while the reply is written
  if (conv.mode === "bot" && conv.channel === "instagram" && customer.ig_user_id) {
    await Promise.all([senderAction(customer.ig_user_id, "mark_seen"), senderAction(customer.ig_user_id, "typing_on")]);
  }
  const t0 = Date.now();

  const untranscribed = await transcribePending(conv.id);
  const extra = [opts.extraSystem, untranscribed ? `${untranscribed} voice note(s) could not be transcribed. Ask the customer kindly to write it, or request_owner(kind=low_confidence) if it seems important.` : ""].filter(Boolean).join("\n");

  let result: AgentResult;
  try {
    result = await runAgent(conv, customer, { extraSystem: extra || undefined });
  } catch (e) {
    const msg = (e as Error).message;
    if (/credit balance is too low/i.test(msg)) {
      // retrying won't help: tell the owner once, plainly, and stop
      await notify({ kind: "bot.no_credit", priority: "urgent", title: "Bot stopped: the AI account is out of credit", body: "Top up at console.anthropic.com -> Billing. Until then every chat is yours.", link: `/admin/inbox/${conv.id}` });
      return { status: "error", reason: "no AI credit" };
    }
    await notify({ kind: "bot.error", priority: "urgent", title: `Bot error - ${label(customer)}`, body: msg.slice(0, 160), link: `/admin/inbox/${conv.id}` });
    throw e; // job runner retries
  }

  const run = must(await db().from("agent_runs").insert({
    conversation_id: conv.id, model: result.model, input_tokens: result.usage.input, output_tokens: result.usage.output,
    cache_read_tokens: result.usage.cacheRead, cache_write_tokens: result.usage.cacheWrite, cost_usd: result.usage.costUsd,
    tool_calls: result.toolCalls, outcome: result.outcome === "no_reply" ? "replied" : result.outcome === "blocked" ? "blocked" : result.outcome === "error" ? "error" : conv.mode === "draft" ? "drafted" : result.outcome,
  }).select("id").single(), "agent run") as { id: string };

  if (result.outcome === "blocked" || result.outcome === "error") {
    await db().from("conversations").update({ mode: "owner", mode_until: null }).eq("id", conv.id);
    await notify({ kind: "bot.blocked", priority: "urgent", title: `Bot couldn't reply - ${label(customer)}`, body: result.outcome === "blocked" ? "Its reply had a price that isn't on the price list, so it wasn't sent. The chat is yours." : "Something went wrong - the chat is yours.", link: `/admin/inbox/${conv.id}` });
    return { status: "error", outcome: result.outcome, costUsd: result.usage.costUsd };
  }

  const bubbles = result.outbox.filter((o) => o.type === "text").map((o) => (o as { text: string }).text);
  const quoteSent = result.toolCalls.some((t) => ["get_quote", "add_to_order", "set_delivery_town", "update_order_line"].includes(t.name) && !t.isError);
  await db().from("conversations").update({ bot_replies_total: conv.bot_replies_total + 1 }).eq("id", conv.id);
  if (!result.outbox.length) return { status: "no_reply", outcome: result.outcome, costUsd: result.usage.costUsd };

  if (conv.mode === "draft") {
    // supersede older drafts that were never approved
    const old = must(await db().from("approvals").select("id").eq("conversation_id", conv.id).eq("kind", "draft_reply").eq("status", "pending"), "old drafts") as { id: string }[];
    if (old.length) {
      await db().from("approvals").update({ status: "expired" }).in("id", old.map((o) => o.id));
      await db().from("messages").update({ status: "discarded" }).eq("conversation_id", conv.id).eq("status", "draft");
    }
    const msgs = await queueOutgoing(conv, result.outbox, { sender: "bot", draft: true, runId: run.id });
    await createApproval({
      conversationId: conv.id, kind: "draft_reply", customerLabel: label(customer),
      summary: bubbles.join(" / ").slice(0, 300) || "(photos)", draftReply: bubbles.join("\n\n"),
      proposal: { message_ids: msgs.map((m) => m.id), agent_run_id: run.id, photos: result.outbox.filter((o) => o.type === "image").length },
    });
    return { status: "drafted", outcome: result.outcome, costUsd: result.usage.costUsd, quoteSent, bubbles };
  }

  const t1 = Date.now();
  await queueOutgoing(conv, result.outbox, { sender: "bot", draft: false, runId: run.id });
  await sendQueued(conv, customer);
  console.log(`[turn] ${conv.id.slice(0, 8)} reply ready ${t1 - t0}ms, sent ${Date.now() - t1}ms`);
  return { status: "sent", outcome: result.outcome, costUsd: result.usage.costUsd, quoteSent, bubbles };
}

/** Owner approved (or edited) a drafted reply: send it. Edited text replaces the drafted text bubbles. */
export async function sendApprovedDraft(approvalId: string, editedText?: string | null) {
  const a = must(await db().from("approvals").select("*").eq("id", approvalId).single(), "approval") as { conversation_id: string; proposal: { message_ids?: string[] } };
  const { conv, customer } = await load(a.conversation_id);
  const ids = a.proposal.message_ids ?? [];
  if (editedText?.trim()) {
    await db().from("messages").update({ status: "discarded" }).in("id", ids).eq("kind", "text");
    await db().from("messages").update({ status: "queued" }).in("id", ids).eq("kind", "image");
    await queueOutgoing(conv, editedText.split(/\n\s*\n/).map((t) => ({ type: "text" as const, text: t.trim() })).filter((t) => t.text), { sender: "owner", draft: false });
  } else {
    await db().from("messages").update({ status: "queued" }).in("id", ids).eq("status", "draft");
  }
  const late = conv.window_expires_at && new Date(conv.window_expires_at) < new Date();
  return sendQueued(conv, customer, { humanAgent: !!late });
}
