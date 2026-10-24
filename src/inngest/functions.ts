import { inngest, EV } from "./client";
import { db, must } from "@/lib/db";
import { processConversation, sendApprovedDraft } from "@/lib/conversation/process";
import { queueOutgoing, sendQueued } from "@/lib/conversation/deliver";
import { notify } from "@/lib/notify";
import { settings, type SpendLimits } from "@/lib/conversation/limits";
import { syncInstagramMedia } from "@/lib/channels/media-sync";
import { syncSupplierNewArrivals } from "@/lib/catalog/supplier-sync";

/**
 * One bot turn per conversation burst: waits for the customer to stop typing (15s, max 60s),
 * never runs two turns of the same chat at once, retries on transient errors.
 */
export const conversationTurn = inngest.createFunction(
  {
    id: "conversation-turn",
    triggers: [{ event: EV.messageReceived }, { event: EV.resume }],
    debounce: { key: "event.data.conversationId", period: "15s", timeout: "60s" },
    concurrency: [{ key: "event.data.conversationId", limit: 1 }],
    retries: 3,
  },
  async ({ event, step }) => {
    const conversationId = event.data.conversationId as string;
    const note = event.name === EV.resume ? (event.data.note as string | undefined) : undefined;
    const res = await step.run("process", () => processConversation(conversationId, { extraSystem: note }));
    if (res.status === "sent" && res.quoteSent) {
      await step.sendEvent("schedule-followup", { name: EV.quoteSent, data: { conversationId, at: new Date().toISOString() } });
    }
    return res;
  },
);

/** One gentle "بعدك معني؟" ~3h after a quote if the customer went quiet (only inside the 24h window). */
export const quoteFollowup = inngest.createFunction(
  {
    id: "quote-followup",
    triggers: [{ event: EV.quoteSent }],
    cancelOn: [{ event: EV.messageReceived, match: "data.conversationId" }],
    concurrency: [{ key: "event.data.conversationId", limit: 1 }],
  },
  async ({ event, step }) => {
    await step.sleep("wait-3h", "3h");
    const conversationId = event.data.conversationId as string;
    const ok = await step.run("still-quiet", async () => {
      const c = must(await db().from("conversations").select("mode,window_expires_at,last_customer_msg_at").eq("id", conversationId).single(), "conv") as { mode: string; window_expires_at: string | null; last_customer_msg_at: string | null };
      const open = await db().from("orders").select("id").eq("conversation_id", conversationId).in("status", ["quoted", "awaiting_details", "awaiting_confirmation"]).limit(1);
      const pending = await db().from("approvals").select("id").eq("conversation_id", conversationId).eq("status", "pending").limit(1);
      return ["bot", "draft"].includes(c.mode) && !!c.window_expires_at && new Date(c.window_expires_at).getTime() - Date.now() > 30 * 60_000
        && (open.data?.length ?? 0) > 0 && !(pending.data?.length) && (!c.last_customer_msg_at || c.last_customer_msg_at <= event.data.at);
    });
    if (!ok) return { skipped: true };
    return step.run("nudge", () => processConversation(conversationId, {
      extraSystem: "The customer went quiet after your last quote ~3 hours ago. Send ONE short, friendly follow-up in the owner's style (e.g. 'عالعافية اخوي، بعدك معني بالطلبية؟') - no pressure, no new information, no discount.",
    }));
  },
);

/** Owner decided an approval in the admin. Drafts get sent; other decisions let the bot continue. */
export const approvalDecided = inngest.createFunction(
  { id: "approval-decided", triggers: [{ event: EV.approvalDecided }], retries: 3 },
  async ({ event, step }) => {
    const a = await step.run("load", async () => must(await db().from("approvals").select("id,kind,status,conversation_id,final_reply").eq("id", event.data.approvalId).single(), "approval") as { id: string; kind: string; status: string; conversation_id: string; final_reply: string | null });
    if (a.kind === "draft_reply") {
      if (a.status === "approved" || a.status === "edited") return step.run("send-draft", () => sendApprovedDraft(a.id, a.status === "edited" ? a.final_reply : null));
      if (a.status === "rejected") await step.run("discard", async () => { await db().from("messages").update({ status: "discarded" }).eq("conversation_id", a.conversation_id).eq("status", "draft"); });
      return { done: a.status };
    }
    if (a.status === "taken_over") return { done: "owner took over" };
    await step.sendEvent("resume-bot", { name: EV.resume, data: { conversationId: a.conversation_id, note: "The owner just decided a pending request (see 'Owner decisions' in the state). Tell the customer the outcome now, in the owner's style, and continue the sale." } });
    return { resumed: true };
  },
);

/** Approval still pending after 2h: remind the owner; tell the customer once that we're still checking. */
export const approvalReminder = inngest.createFunction(
  { id: "approval-reminder", triggers: [{ event: EV.approvalCreated }] },
  async ({ event, step }) => {
    await step.sleep("wait-2h", "2h");
    return step.run("remind", async () => {
      const a = (await db().from("approvals").select("id,kind,status,conversation_id,proposal").eq("id", event.data.approvalId).maybeSingle()).data as { id: string; kind: string; status: string; conversation_id: string; proposal: { summary?: string } } | null;
      if (!a || a.status !== "pending") return { skipped: true };
      await notify({ kind: "approval.reminder", priority: "urgent", title: "Reminder: a customer is waiting for you", body: a.proposal.summary?.slice(0, 160), link: `/admin/approvals/${a.id}` });
      if (a.kind === "draft_reply") return { reminded: true };
      const conv = must(await db().from("conversations").select("*").eq("id", a.conversation_id).single(), "conv");
      const customer = must(await db().from("customers").select("*").eq("id", conv.customer_id).single(), "customer");
      if (conv.channel === "instagram" && (!conv.window_expires_at || new Date(conv.window_expires_at) < new Date())) return { reminded: true };
      await queueOutgoing(conv, [{ type: "text", text: "لسا عم نتأكدلك، شوي وبرجعلك 🙏" }], { sender: "bot", draft: false });
      await sendQueued(conv, customer);
      return { reminded: true, toldCustomer: true };
    });
  },
);

/** Every 30 min: alert once a day when AI spend passes the alert threshold. */
export const spendWatch = inngest.createFunction(
  { id: "spend-watch", triggers: [{ cron: "TZ=Asia/Jerusalem */30 * * * *" }] },
  async ({ step }) => step.run("check", async () => {
    const sp = await settings<SpendLimits>("spend", { daily_alert_usd: 10, daily_stop_usd: 25, override_until: null });
    const spent = Number(must(await db().rpc("spend_today_usd"), "spend"));
    if (spent < sp.daily_alert_usd) return { spent };
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const already = await db().from("notifications").select("id").eq("kind", `bot.spend_alert.${today}`).limit(1);
    if (already.data?.length) return { spent, alerted: "earlier" };
    await notify({ kind: `bot.spend_alert.${today}`, priority: "normal", title: `Bot AI spend today: $${spent.toFixed(2)}`, body: `Alert at $${sp.daily_alert_usd}; the bot stops at $${sp.daily_stop_usd}.`, link: "/admin/settings" });
    return { spent, alerted: true };
  }),
);

/** Every 15 min: pull new posts/stories and suggest which shirts they show (owner confirms in /admin/media). */
export const mediaSync = inngest.createFunction(
  { id: "instagram-media-sync", triggers: [{ cron: "*/15 * * * *" }], concurrency: [{ limit: 1 }] },
  async ({ step }) => step.run("sync", () => syncInstagramMedia()),
);

/** Daily 04:00 Israel: add new supplier shirt albums to the catalog. */
export const supplierSync = inngest.createFunction(
  { id: "supplier-sync", triggers: [{ cron: "TZ=Asia/Jerusalem 0 4 * * *" }], concurrency: [{ limit: 1 }] },
  async ({ step }) => step.run("sync", () => syncSupplierNewArrivals(3)),
);

export const functions = [conversationTurn, quoteFollowup, approvalDecided, approvalReminder, spendWatch, mediaSync, supplierSync];
