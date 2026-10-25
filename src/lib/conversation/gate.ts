/**
 * Pure decisions behind the owner's controls and the bot's limits (unit-tested in gate.test.ts).
 * The database lookups that feed them live in limits.ts, process.ts and the admin actions.
 */
export interface RateLimits { new_per_24h: number; new_lifetime_before_review: number; engaged_per_24h: number; buyer_per_24h: number; spam_msgs_per_min: number }
export interface SpendLimits { daily_alert_usd: number; daily_stop_usd: number; override_until: string | null }

export type Gate =
  | { ok: true; tier: "new" | "engaged" | "buyer" }
  | { ok: false; reason: "spam" | "rate_limit" | "lifetime_review" | "spend_stop"; tier?: string };

export interface GateFacts {
  now: Date;
  unlimitedUntil: string | null;   // per-chat "No limit" button
  burstLastMinute: number;         // customer messages in the last minute
  spentTodayUsd: number;
  hasBought: boolean;
  hasOpenQuote: boolean;
  turns24h: number;                // bot replies in this chat in the last 24h
  botRepliesTotal: number;
}

const future = (iso: string | null, now: Date) => !!iso && new Date(iso) > now;

/** May the bot take a turn? Spam, the daily spend cap and the per-chat reply limits (Settings + the chat's "No limit" buttons). */
export function decideGate(rl: RateLimits, sp: SpendLimits, f: GateFacts): Gate {
  const unlimited = future(f.unlimitedUntil, f.now);
  if (!unlimited && f.burstLastMinute > rl.spam_msgs_per_min) return { ok: false, reason: "spam" };
  if (!future(sp.override_until, f.now) && f.spentTodayUsd >= sp.daily_stop_usd) return { ok: false, reason: "spend_stop" };
  const tier = f.hasBought ? "buyer" : f.hasOpenQuote ? "engaged" : "new";
  if (unlimited) return { ok: true, tier };
  const cap = tier === "buyer" ? rl.buyer_per_24h : tier === "engaged" ? rl.engaged_per_24h : rl.new_per_24h;
  if (f.turns24h >= cap) return { ok: false, reason: "rate_limit", tier };
  if (tier === "new" && f.botRepliesTotal >= rl.new_lifetime_before_review) return { ok: false, reason: "lifetime_review", tier };
  return { ok: true, tier };
}

/** Why a bot turn must not run at all (null = it may): the header on/off switch (Instagram only) and the chat's mode. */
export function turnBlocker(c: { channel: string; mode: string; mode_until: string | null }, botOn: boolean, now: Date): string | null {
  if (c.channel === "instagram" && !botOn) return "bot switched off";
  if (["owner", "paused", "blocked"].includes(c.mode) && (!c.mode_until || future(c.mode_until, now))) return `mode ${c.mode}`;
  return null;
}

export type ConversationAction = "take_over" | "hand_back" | "draft_mode" | "pause" | "unblock" | "unlimited_24h" | "unlimited_forever" | "limits_normal";

/** What each chat button in the admin does to the conversation row. */
export function conversationPatch(action: ConversationAction, autonomy: string | undefined, now: Date): Record<string, unknown> {
  const botMode = autonomy === "auto" ? "bot" : "draft";
  return {
    take_over: { mode: "owner", mode_until: null },
    hand_back: { mode: botMode, mode_until: null, bot_replies_total: 0 },
    draft_mode: { mode: "draft", mode_until: null },
    pause: { mode: "paused", mode_until: null },
    unblock: { mode: "draft", spam_blocked_at: null },
    unlimited_24h: { unlimited_until: new Date(now.getTime() + 24 * 3600_000).toISOString() },
    unlimited_forever: { unlimited_until: "9999-12-31T00:00:00Z" },
    limits_normal: { unlimited_until: null },
  }[action];
}
