import "server-only";
import { db } from "../db";
import { userProfile } from "../channels/instagram";

/**
 * Test phase: the bot only sees chats with listed Instagram usernames. Everyone else is ignored
 * completely (not stored, not answered) and the owner handles them in Instagram as usual.
 * Missing setting = test phase with nobody on the list, so a fresh connection never talks to real customers.
 */
export interface TesterSetting { enabled: boolean; usernames: string[]; allowed_ids?: string[]; code?: string }

/** Default join word for testers (Instagram won't reveal usernames of people whose DM is still a request). */
export const DEFAULT_TEST_CODE = "kvtest";

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
}

export function parseUsernames(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map(normalizeUsername).filter((u) => /^[a-z0-9._]{1,30}$/.test(u)))];
}

export async function testerSetting(): Promise<TesterSetting> {
  const v = (await db().from("bot_settings").select("value").eq("key", "testers").maybeSingle()).data?.value as Partial<TesterSetting> | undefined;
  return { enabled: v?.enabled ?? true, usernames: v?.usernames ?? [], allowed_ids: v?.allowed_ids ?? [], code: v?.code || DEFAULT_TEST_CODE };
}

async function remember(s: TesterSetting, igsid: string) {
  await db().from("bot_settings").upsert({ key: "testers", value: { ...s, allowed_ids: [...new Set([...(s.allowed_ids ?? []), igsid])] }, updated_at: new Date().toISOString() }, { onConflict: "key" });
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
    await remember(s, igsid);
    console.log(`[testers] ${igsid} joined with the test code`);
    return "joined";
  }
  if (!s.usernames.length) { console.log(`[testers] dropped ${igsid}: no testers listed`); return "deny"; }
  const profile = await userProfile(igsid).catch((e) => ({ error: (e as Error).message } as { username?: string; error?: string }));
  const username = normalizeUsername(profile.username ?? "");
  if (!username || !s.usernames.includes(username)) {
    console.log(`[testers] dropped ${igsid}: ${username ? `@${username} is not on the list` : `username unavailable (${profile.error ?? "no username"}) - testers can send "${s.code}" once`}`);
    return "deny";
  }
  await remember(s, igsid);
  return "allow";
}
