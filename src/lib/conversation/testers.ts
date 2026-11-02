import "server-only";
import { db } from "../db";
import { userProfile } from "../channels/instagram";

/**
 * Test phase: the bot only sees chats with listed Instagram usernames. Everyone else is ignored
 * completely (not stored, not answered) and the owner handles them in Instagram as usual.
 * Missing setting = test phase with nobody on the list, so a fresh connection never talks to real customers.
 */
export interface TesterSetting {
  enabled: boolean;
  usernames: string[];
  allowed_ids?: string[];
  code?: string;
}

/**
 * Senders already looked up and rejected, kept in their OWN bot_settings row ("tester_denials") so
 * writing it can never overwrite the owner's tester list or a fresh join (it used to live inside
 * "testers" and was written from a stale copy on every message). `for` = the tester list it was
 * built under: editing the list makes every cached denial stale. Per id: 0 = "not on the list"
 * (kept until the list changes), otherwise an expiry time in ms - a failed username lookup
 * (message request not accepted yet, Graph API hiccup) is only trusted briefly.
 */
export interface TesterDenials { for: string; ids: Record<string, number> }
/** Default join word for testers (Instagram won't reveal usernames of people whose DM is still a request). */
export const DEFAULT_TEST_CODE = "kvtest";

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
}

export function parseUsernames(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map(normalizeUsername).filter((u) => /^[a-z0-9._]{1,30}$/.test(u)))];
}

/** A snapshot of the tester list a denial cache was keyed to - both helpers below agree on it. */
export function deniedIdsFingerprint(usernames: string[]): string {
  return usernames.join(",");
}

/** How long a failed username lookup is trusted before Instagram is asked again. */
export const LOOKUP_FAILURE_TTL_MS = 15 * 60_000;
const MAX_DENIALS = 2000;

/** Was this sender already rejected under the CURRENT tester list (and is that verdict still fresh)? Pure. */
export function isCachedDenial(usernames: string[], d: TesterDenials | null, igsid: string, now = Date.now()): boolean {
  if (!d || d.for !== deniedIdsFingerprint(usernames)) return false;
  const until = d.ids[igsid];
  return until !== undefined && (until === 0 || until > now);
}

/** The cache after rejecting one more sender (pure): drops expired and over-cap entries. */
export function withDenial(usernames: string[], d: TesterDenials | null, igsid: string, lookupFailed: boolean, now = Date.now()): TesterDenials {
  const fp = deniedIdsFingerprint(usernames);
  const kept = Object.entries(d && d.for === fp ? d.ids : {}).filter(([id, until]) => id !== igsid && (until === 0 || until > now));
  const ids = Object.fromEntries([...kept.slice(-(MAX_DENIALS - 1)), [igsid, lookupFailed ? now + LOOKUP_FAILURE_TTL_MS : 0]]);
  return { for: fp, ids };
}

export async function testerSetting(): Promise<TesterSetting> {
  const v = (await db().from("bot_settings").select("value").eq("key", "testers").maybeSingle()).data?.value as Partial<TesterSetting> | undefined;
  return { enabled: v?.enabled ?? true, usernames: v?.usernames ?? [], allowed_ids: v?.allowed_ids ?? [], code: v?.code || DEFAULT_TEST_CODE };
}

const readDenials = async () => ((await db().from("bot_settings").select("value").eq("key", "tester_denials").maybeSingle()).data?.value as TesterDenials | undefined) ?? null;

/** Adds a tester id. Re-reads the row right before writing and only merges allowed_ids, so it never undoes an edit saved in Settings meanwhile. */
async function remember(igsid: string) {
  const fresh = (await db().from("bot_settings").select("value").eq("key", "testers").maybeSingle()).data?.value as Partial<TesterSetting> | undefined;
  const value = { ...(fresh ?? {}), allowed_ids: [...new Set([...(fresh?.allowed_ids ?? []), igsid])] };
  await db().from("bot_settings").upsert({ key: "testers", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/**
 * Remembers a rejected sender so their next message skips the Instagram profile lookup (owner
 * report 2026-11-02: one repeat non-tester was costing a DB read + a Graph API call per message).
 */
async function rememberDenied(usernames: string[], igsid: string, lookupFailed: boolean) {
  const value = withDenial(usernames, await readDenials(), igsid, lookupFailed);
  await db().from("bot_settings").upsert({ key: "tester_denials", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/**
 * May the bot handle this Instagram user?
 * - "allow": a known tester (or the test phase is off);
 * - "joined": this message was the test code word - the sender is now a tester (don't answer the code itself);
 * - "deny": not a tester - ignore completely.
 * Username lookup is a fallback: Instagram refuses it until a message request is accepted.
 */
export async function botMayHandle(igsid: string, text?: string): Promise<"allow" | "joined" | "deny"> {
  const s = await testerSetting();
  if (!s.enabled) return "allow";
  if (s.allowed_ids?.includes(igsid)) return "allow";
  if (text && s.code && text.trim().toLowerCase() === s.code.toLowerCase()) {
    await remember(igsid);
    console.log(`[testers] ${igsid} joined with the test code`);
    return "joined";
  }
  // Repeat sender we already rejected under today's list - skip the Graph API round trip.
  if (isCachedDenial(s.usernames, await readDenials(), igsid)) return "deny";

  if (!s.usernames.length) {
    console.log(`[testers] dropped ${igsid}: no testers listed`);
    await rememberDenied(s.usernames, igsid, false);
    return "deny";
  }
  const profile = await userProfile(igsid).catch((e) => ({ error: (e as Error).message } as { username?: string; error?: string }));
  const username = normalizeUsername(profile.username ?? "");
  if (!username || !s.usernames.includes(username)) {
    console.log(`[testers] dropped ${igsid}: ${username ? `@${username} is not on the list` : `username unavailable (${profile.error ?? "no username"}) - testers can send "${s.code}" once`}`);
    await rememberDenied(s.usernames, igsid, !username); // a failed lookup is only trusted for a short while
    return "deny";
  }
  await remember(igsid);
  return "allow";
}
