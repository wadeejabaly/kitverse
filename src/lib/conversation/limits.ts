import "server-only";
import { db, must } from "../db";
import type { ConversationRow } from "../agent/state";

import { decideGate, type Gate, type RateLimits, type SpendLimits } from "./gate";

export type { Gate, RateLimits, SpendLimits };

export async function settings<T>(key: string, fallback: T): Promise<T> {
  const r = await db().from("bot_settings").select("value").eq("key", key).maybeSingle();
  return (r.data?.value as T) ?? fallback;
}

/** The owner's header switch: off = he answers Instagram himself, the bot stays silent. */
export async function botOn(): Promise<boolean> {
  return (await settings<{ on?: boolean }>("bot_on", { on: true })).on !== false;
}

/** Decides whether the bot may take a turn (the decision itself is decideGate in gate.ts). */
export async function checkGate(conv: ConversationRow): Promise<Gate> {
  const now = new Date();
  const [rl, sp, burst, spent, bought, engagedOrder, turns] = await Promise.all([
    settings<RateLimits>("rate_limits", { new_per_24h: 40, new_lifetime_before_review: 80, engaged_per_24h: 80, buyer_per_24h: 150, spam_msgs_per_min: 20 }),
    settings<SpendLimits>("spend", { daily_alert_usd: 10, daily_stop_usd: 25, override_until: null }),
    db().from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("direction", "in").gte("created_at", new Date(now.getTime() - 60_000).toISOString()),
    db().rpc("spend_today_usd"),
    db().from("orders").select("id", { count: "exact", head: true }).eq("customer_id", conv.customer_id)
      .not("status", "in", "(draft,quoted,awaiting_details,awaiting_confirmation,cancelled)"),
    db().from("orders").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).in("status", ["quoted", "awaiting_details", "awaiting_confirmation"]),
    db().from("agent_runs").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id)
      .in("outcome", ["replied", "drafted", "approval"]).gte("created_at", new Date(now.getTime() - 24 * 3600_000).toISOString()),
  ]);
  return decideGate(rl, sp, {
    now, unlimitedUntil: conv.unlimited_until, burstLastMinute: burst.count ?? 0, spentTodayUsd: Number(must(spent, "spend")),
    hasBought: (bought.count ?? 0) > 0, hasOpenQuote: (engagedOrder.count ?? 0) > 0, turns24h: turns.count ?? 0, botRepliesTotal: conv.bot_replies_total,
  });
}
