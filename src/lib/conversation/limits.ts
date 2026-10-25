import "server-only";
import { db, must } from "../db";
import type { ConversationRow } from "../agent/state";

export interface RateLimits { new_per_24h: number; new_lifetime_before_review: number; engaged_per_24h: number; buyer_per_24h: number; spam_msgs_per_min: number }
export interface SpendLimits { daily_alert_usd: number; daily_stop_usd: number; override_until: string | null }

export async function settings<T>(key: string, fallback: T): Promise<T> {
  const r = await db().from("bot_settings").select("value").eq("key", key).maybeSingle();
  return (r.data?.value as T) ?? fallback;
}

/** The owner's header switch: off = he answers Instagram himself, the bot stays silent. */
export async function botOn(): Promise<boolean> {
  return (await settings<{ on?: boolean }>("bot_on", { on: true })).on !== false;
}

export type Gate =
  | { ok: true; tier: "new" | "engaged" | "buyer" }
  | { ok: false; reason: "spam" | "rate_limit" | "lifetime_review" | "spend_stop"; tier?: string };

/** Decides whether the bot may take a turn. Per-chat override (`unlimited_until`) skips the volume limits. */
export async function checkGate(conv: ConversationRow): Promise<Gate> {
  const rl = await settings<RateLimits>("rate_limits", { new_per_24h: 40, new_lifetime_before_review: 80, engaged_per_24h: 80, buyer_per_24h: 150, spam_msgs_per_min: 20 });
  const sp = await settings<SpendLimits>("spend", { daily_alert_usd: 10, daily_stop_usd: 25, override_until: null });
  const overridden = !!conv.unlimited_until && new Date(conv.unlimited_until) > new Date();

  if (!overridden) {
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const burst = await db().from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("direction", "in").gte("created_at", minuteAgo);
    if ((burst.count ?? 0) > rl.spam_msgs_per_min) return { ok: false, reason: "spam" };
  }

  const spendOverride = !!sp.override_until && new Date(sp.override_until) > new Date();
  if (!spendOverride) {
    const spent = Number(must(await db().rpc("spend_today_usd"), "spend"));
    if (spent >= sp.daily_stop_usd) return { ok: false, reason: "spend_stop" };
  }

  const bought = await db().from("orders").select("id", { count: "exact", head: true }).eq("customer_id", conv.customer_id)
    .not("status", "in", "(draft,quoted,awaiting_details,awaiting_confirmation,cancelled)");
  const engagedOrder = await db().from("orders").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id)
    .in("status", ["quoted", "awaiting_details", "awaiting_confirmation"]);
  const tier = (bought.count ?? 0) > 0 ? "buyer" : (engagedOrder.count ?? 0) > 0 ? "engaged" : "new";
  if (overridden) return { ok: true, tier };

  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const turns = await db().from("agent_runs").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id)
    .in("outcome", ["replied", "drafted", "approval"]).gte("created_at", dayAgo);
  const cap = tier === "buyer" ? rl.buyer_per_24h : tier === "engaged" ? rl.engaged_per_24h : rl.new_per_24h;
  if ((turns.count ?? 0) >= cap) return { ok: false, reason: "rate_limit", tier };
  if (tier === "new" && conv.bot_replies_total >= rl.new_lifetime_before_review) return { ok: false, reason: "lifetime_review", tier };
  return { ok: true, tier };
}
