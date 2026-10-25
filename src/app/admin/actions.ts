"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseUsernames } from "@/lib/conversation/testers";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import { emit } from "@/inngest/emit";
import { EV } from "@/inngest/client";
import { processConversation, sendApprovedDraft } from "@/lib/conversation/process";
import { queueOutgoing, sendQueued } from "@/lib/conversation/deliver";
import { storeInbound, getOrCreateConversation } from "@/lib/conversation/ingest";
import { normalize } from "@/lib/text";

async function audit(actor: string | null, action: string, entity: string, entityId: string, after?: unknown) {
  await db().from("audit_log").insert({ actor, action, entity, entity_id: entityId, after: after ?? null });
}

// ---------------------------------------------------------------- auth

export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
  if (error) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    redirect("/admin/login?error=credentials");
  }
  redirect("/admin");
}

export async function signOut() {
  await (await supabaseServer()).auth.signOut();
  redirect("/admin/login");
}

export async function setPassword(form: FormData) {
  const password = String(form.get("password") ?? "");
  if (password.length < 10) redirect("/admin/set-password?error=short");
  const { error } = await (await supabaseServer()).auth.updateUser({ password });
  if (error) redirect("/admin/set-password?error=failed");
  redirect("/admin");
}

// ---------------------------------------------------------------- approvals

const Decision = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "edited", "rejected", "taken_over"]),
  text: z.string().max(4000).optional(),
  note: z.string().max(1000).optional(),
});

/** Approve / edit / reject / take over. Drafts are sent; other decisions resume the bot with the owner's note. */
export async function decideApproval(form: FormData) {
  const staff = await requireStaff();
  const d = Decision.parse({
    approvalId: form.get("approvalId"), decision: form.get("decision"),
    text: (form.get("text") as string) || undefined, note: (form.get("note") as string) || undefined,
  });
  const a = must(await db().from("approvals").select("*").eq("id", d.approvalId).single(), "approval") as { id: string; kind: string; status: string; conversation_id: string; draft_reply: string | null; proposal: Record<string, unknown> };
  if (a.status !== "pending") redirect(`/admin/approvals/${a.id}?error=already_decided`);

  const edited = d.decision === "edited" || (d.decision === "approved" && d.text && d.text.trim() !== (a.draft_reply ?? "").trim());
  const status = edited ? "edited" : d.decision;
  must(await db().from("approvals").update({
    status, decided_by: staff.id, decided_at: new Date().toISOString(),
    final_reply: d.text ?? d.note ?? null, proposal: { ...a.proposal, owner_note: d.note ?? null },
  }).eq("id", a.id).eq("status", "pending").select("id"), "decide");
  await audit(staff.id, `approval.${status}`, "approval", a.id, { text: d.text, note: d.note });

  if (d.decision === "taken_over") {
    await db().from("conversations").update({ mode: "owner", mode_until: null }).eq("id", a.conversation_id);
  }
  // remember availability answers so the next customer doesn't trigger another check
  if (a.kind === "availability_check" && (status === "approved" || status === "edited" || status === "rejected")) {
    await db().from("availability_answers").insert({
      query_key: normalize(String(a.proposal.key ?? a.proposal.summary ?? "")), description: d.note ?? d.text ?? null,
      answer: status === "rejected" ? "not_available" : "available", approval_id: a.id, decided_by: staff.id,
      expires_at: status === "rejected" ? new Date(Date.now() + 30 * 86400_000).toISOString() : null,
    });
  }

  const queued = await emit(EV.approvalDecided, { approvalId: a.id }).catch(() => false);
  if (!queued) {
    // no job runner (local without the dev server): do it inline
    if (a.kind === "draft_reply") {
      if (status === "approved" || status === "edited") await sendApprovedDraft(a.id, status === "edited" ? d.text : null);
      if (status === "rejected") await db().from("messages").update({ status: "discarded" }).eq("conversation_id", a.conversation_id).eq("status", "draft");
    } else if (status !== "taken_over") {
      await processConversation(a.conversation_id, { extraSystem: "The owner just decided a pending request (see 'Owner decisions'). Tell the customer the outcome now and continue." });
    }
  }
  revalidatePath("/admin", "layout");
  redirect(form.get("next") === "inbox" ? `/admin/inbox/${a.conversation_id}` : "/admin/approvals");
}

// ---------------------------------------------------------------- conversations

const ConvAction = z.object({
  conversationId: z.string().uuid(),
  action: z.enum(["take_over", "hand_back", "draft_mode", "pause", "unblock", "unlimited_24h", "unlimited_forever", "limits_normal"]),
});

export async function conversationAction(form: FormData) {
  const staff = await requireStaff();
  const { conversationId, action } = ConvAction.parse({ conversationId: form.get("conversationId"), action: form.get("action") });
  const autonomy = ((await db().from("bot_settings").select("value").eq("key", "autonomy").maybeSingle()).data?.value as { mode?: string } | undefined)?.mode;
  const patch: Record<string, unknown> = {
    take_over: { mode: "owner", mode_until: null },
    hand_back: { mode: autonomy === "auto" ? "bot" : "draft", mode_until: null, bot_replies_total: 0 },
    draft_mode: { mode: "draft", mode_until: null },
    pause: { mode: "paused", mode_until: null },
    unblock: { mode: "draft", spam_blocked_at: null },
    unlimited_24h: { unlimited_until: new Date(Date.now() + 24 * 3600_000).toISOString() },
    unlimited_forever: { unlimited_until: "9999-12-31T00:00:00Z" },
    limits_normal: { unlimited_until: null },
  }[action];
  must(await db().from("conversations").update(patch).eq("id", conversationId).select("id"), "conversation action");
  await audit(staff.id, `conversation.${action}`, "conversation", conversationId, patch);
  if (action === "hand_back") await emit(EV.resume, { conversationId, note: "The owner handed this chat back to you. Read the latest messages (including what the owner wrote) and continue only if the customer is waiting for an answer; otherwise reply <no_reply>." }).catch(() => false);
  revalidatePath(`/admin/inbox/${conversationId}`);
}

export async function ownerSend(form: FormData) {
  const staff = await requireStaff();
  const conversationId = z.string().uuid().parse(form.get("conversationId"));
  const text = z.string().min(1).max(2000).parse(String(form.get("text") ?? "").trim());
  const conv = must(await db().from("conversations").select("*").eq("id", conversationId).single(), "conv");
  const customer = must(await db().from("customers").select("*").eq("id", conv.customer_id).single(), "customer");
  await queueOutgoing(conv, [{ type: "text", text }], { sender: "owner", draft: false });
  const late = conv.window_expires_at && new Date(conv.window_expires_at) < new Date();
  await sendQueued(conv, customer, { humanAgent: !!late });
  if (conv.mode === "bot" || conv.mode === "draft") await db().from("conversations").update({ mode: "owner", mode_until: new Date(Date.now() + 12 * 3600_000).toISOString() }).eq("id", conversationId);
  await audit(staff.id, "conversation.owner_send", "conversation", conversationId);
  revalidatePath(`/admin/inbox/${conversationId}`);
}

// ---------------------------------------------------------------- test chat (simulator)

export async function testChatSend(form: FormData) {
  const staff = await requireStaff();
  const text = String(form.get("text") ?? "").trim();
  const user = `admin-${staff.id ?? "dev"}`;
  if (form.get("reset") === "1") {
    const { conv, customer } = await getOrCreateConversation("simulator", user);
    await db().from("orders").delete().eq("conversation_id", conv.id).in("status", ["draft", "quoted", "awaiting_details", "awaiting_confirmation"]);
    await db().from("conversations").delete().eq("id", conv.id);
    await db().from("customers").delete().eq("id", customer.id);
    revalidatePath("/admin/test-chat");
    return;
  }
  if (!text) return;
  const r = await storeInbound("simulator", { type: "message", senderId: user, recipientId: "kitverse", timestamp: Date.now(), text });
  await processConversation(r.conversationId);
  revalidatePath("/admin/test-chat");
}

// ---------------------------------------------------------------- settings

export async function saveSetting(form: FormData) {
  const staff = await requireStaff();
  const key = z.enum(["autonomy", "spend_override", "deposit", "rate_limits", "spend_limits", "testers"]).parse(form.get("key"));
  const get = async (k: string) => ((await db().from("bot_settings").select("value").eq("key", k).maybeSingle()).data?.value ?? {}) as Record<string, unknown>;
  let row: { key: string; value: Record<string, unknown> };
  if (key === "autonomy") row = { key, value: { mode: form.get("mode") === "auto" ? "auto" : "draft" } };
  else if (key === "spend_override") {
    const cur = await get("spend");
    const v = form.get("value");
    const until = v === "today" ? new Date(new Date().setHours(23, 59, 59, 999)).toISOString() : v === "forever" ? "9999-12-31T00:00:00Z" : null;
    row = { key: "spend", value: { ...cur, override_until: until } };
  } else if (key === "spend_limits") {
    const cur = await get("spend");
    row = { key: "spend", value: { ...cur, daily_alert_usd: z.coerce.number().min(1).max(500).parse(form.get("daily_alert_usd")), daily_stop_usd: z.coerce.number().min(1).max(1000).parse(form.get("daily_stop_usd")) } };
  } else if (key === "testers") {
    const cur = await get("testers");
    const usernames = parseUsernames(String(form.get("usernames") ?? ""));
    // keep remembered ids only while their usernames stay listed: simplest is to re-resolve after any edit
    const code = String(form.get("code") ?? "").trim().toLowerCase().slice(0, 30) || "kvtest";
    // keep accounts that joined with the code word; usernames are re-checked on their next message
    row = { key, value: { ...cur, enabled: form.get("mode") !== "everyone", usernames, code } };
  } else if (key === "deposit") {
    const cur = await get("deposit");
    row = { key, value: { ...cur, enabled: form.get("enabled") === "on" } };
  } else {
    const n = (f: string) => z.coerce.number().int().min(1).max(1000).parse(form.get(f));
    row = { key, value: { new_per_24h: n("new_per_24h"), new_lifetime_before_review: n("new_lifetime_before_review"), engaged_per_24h: n("engaged_per_24h"), buyer_per_24h: n("buyer_per_24h"), spam_msgs_per_min: n("spam_msgs_per_min") } };
  }
  must(await db().from("bot_settings").upsert({ ...row, updated_by: staff.id, updated_at: new Date().toISOString() }, { onConflict: "key" }).select("key"), "save setting");
  await audit(staff.id, `settings.${row.key}`, "bot_settings", row.key, row.value);
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------- notifications

export async function markNotificationsRead() {
  await requireStaff();
  await db().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/admin", "layout");
}

const Sub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });
export async function savePushSubscription(sub: unknown, userAgent: string) {
  const staff = await requireStaff();
  if (!staff.id) return { ok: false, reason: "dev mode has no staff id" };
  const s = Sub.parse(sub);
  must(await db().from("push_subscriptions").upsert({ user_id: staff.id, endpoint: s.endpoint, keys: s.keys, user_agent: userAgent.slice(0, 200) }, { onConflict: "endpoint" }).select("id"), "save push");
  return { ok: true };
}
