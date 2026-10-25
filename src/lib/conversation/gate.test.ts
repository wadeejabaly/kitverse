import { describe, expect, it } from "vitest";
import { conversationPatch, decideGate, turnBlocker, type GateFacts, type RateLimits, type SpendLimits } from "./gate";

const now = new Date("2026-10-25T12:00:00Z");
const rl: RateLimits = { new_per_24h: 40, new_lifetime_before_review: 80, engaged_per_24h: 80, buyer_per_24h: 150, spam_msgs_per_min: 20 };
const sp: SpendLimits = { daily_alert_usd: 10, daily_stop_usd: 25, override_until: null };
const facts = (f: Partial<GateFacts> = {}): GateFacts => ({ now, unlimitedUntil: null, burstLastMinute: 0, spentTodayUsd: 0, hasBought: false, hasOpenQuote: false, turns24h: 0, botRepliesTotal: 0, ...f });

describe("bot on/off switch and chat modes", () => {
  const chat = { channel: "instagram", mode: "bot", mode_until: null };
  it("switch off: the bot stays silent on Instagram", () => expect(turnBlocker(chat, false, now)).toBe("bot switched off"));
  it("switch on: the bot answers", () => expect(turnBlocker(chat, true, now)).toBeNull());
  it("the admin test chat keeps working with the switch off", () => expect(turnBlocker({ ...chat, channel: "simulator" }, false, now)).toBeNull());
  it("owner replied in Instagram: paused for 12 hours", () => {
    const paused = { ...chat, mode: "owner", mode_until: "2026-10-25T20:00:00Z" };
    expect(turnBlocker(paused, true, now)).toBe("mode owner");
    expect(turnBlocker(paused, true, new Date("2026-10-25T21:00:00Z"))).toBeNull(); // pause ran out
  });
  it("'I'll reply' (take over) has no end time", () => expect(turnBlocker({ ...chat, ...conversationPatch("take_over", "auto", now) } as typeof chat, true, now)).toBe("mode owner"));
  it("blocked spam chats stay blocked", () => expect(turnBlocker({ ...chat, mode: "blocked" }, true, now)).toBe("mode blocked"));
});

describe("chat buttons", () => {
  it("hand back follows the 'who sends replies' setting and resets the reply count", () => {
    expect(conversationPatch("hand_back", "auto", now)).toEqual({ mode: "bot", mode_until: null, bot_replies_total: 0 });
    expect(conversationPatch("hand_back", "draft", now)).toEqual({ mode: "draft", mode_until: null, bot_replies_total: 0 });
  });
  it("handed-back chat is answered again", () => {
    const back = { channel: "instagram", mode_until: null, ...conversationPatch("hand_back", "auto", now) } as { channel: string; mode: string; mode_until: null };
    expect(turnBlocker(back, true, now)).toBeNull();
  });
  it("no limit for 24 hours", () => expect(conversationPatch("unlimited_24h", "auto", now)).toEqual({ unlimited_until: "2026-10-26T12:00:00.000Z" }));
});

describe("reply limits (Settings -> Reply limits)", () => {
  it("new customer: stops at the daily cap", () => {
    expect(decideGate(rl, sp, facts({ turns24h: 39 }))).toEqual({ ok: true, tier: "new" });
    expect(decideGate(rl, sp, facts({ turns24h: 40 }))).toEqual({ ok: false, reason: "rate_limit", tier: "new" });
  });
  it("each tier has its own cap", () => {
    expect(decideGate(rl, sp, facts({ turns24h: 79, hasOpenQuote: true }))).toEqual({ ok: true, tier: "engaged" });
    expect(decideGate(rl, sp, facts({ turns24h: 80, hasOpenQuote: true })).ok).toBe(false);
    expect(decideGate(rl, sp, facts({ turns24h: 149, hasBought: true }))).toEqual({ ok: true, tier: "buyer" });
  });
  it("new customer: owner review after the lifetime total", () => {
    expect(decideGate(rl, sp, facts({ botRepliesTotal: 80 }))).toEqual({ ok: false, reason: "lifetime_review", tier: "new" });
    expect(decideGate(rl, sp, facts({ botRepliesTotal: 80, hasOpenQuote: true })).ok).toBe(true); // has a quote: not 'new'
  });
  it("changed limits take effect", () => expect(decideGate({ ...rl, new_per_24h: 5 }, sp, facts({ turns24h: 5 })).ok).toBe(false));
  it("spam: too many messages in a minute", () => {
    expect(decideGate(rl, sp, facts({ burstLastMinute: 21 }))).toEqual({ ok: false, reason: "spam" });
    expect(decideGate(rl, sp, facts({ burstLastMinute: 20 })).ok).toBe(true);
  });
  it("'No limit' button lifts the reply caps and the spam check, until it expires", () => {
    const unlimitedUntil = conversationPatch("unlimited_24h", "auto", now).unlimited_until as string;
    expect(decideGate(rl, sp, facts({ unlimitedUntil, turns24h: 500, burstLastMinute: 50, botRepliesTotal: 500 }))).toEqual({ ok: true, tier: "new" });
    expect(decideGate(rl, sp, facts({ unlimitedUntil, turns24h: 500, now: new Date("2026-10-27T00:00:00Z") })).ok).toBe(false);
  });
  it("'Back to normal limits' restores them", () => {
    const { unlimited_until } = conversationPatch("limits_normal", "auto", now) as { unlimited_until: null };
    expect(decideGate(rl, sp, facts({ unlimitedUntil: unlimited_until, turns24h: 40 })).ok).toBe(false);
  });
});

describe("AI spending (Settings -> AI spending)", () => {
  it("stops at the daily cap", () => {
    expect(decideGate(rl, sp, facts({ spentTodayUsd: 24.99 })).ok).toBe(true);
    expect(decideGate(rl, sp, facts({ spentTodayUsd: 25 }))).toEqual({ ok: false, reason: "spend_stop" });
  });
  it("'Ignore the cap' keeps the bot going until the override ends", () => {
    const today = { ...sp, override_until: "2026-10-25T20:59:59.999Z" };
    expect(decideGate(rl, today, facts({ spentTodayUsd: 40 })).ok).toBe(true);
    expect(decideGate(rl, today, facts({ spentTodayUsd: 40, now: new Date("2026-10-25T21:30:00Z") })).ok).toBe(false);
  });
  it("the cap applies even with 'No limit' on a chat", () => expect(decideGate(rl, sp, facts({ spentTodayUsd: 30, unlimitedUntil: "9999-12-31T00:00:00Z" })).ok).toBe(false));
});
