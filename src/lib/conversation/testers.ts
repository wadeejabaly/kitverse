import "server-only";
import { db } from "../db";
import { userProfile } from "../channels/instagram";

/**
 * Test phase: the bot only sees chats with listed Instagram usernames. Everyone else is ignored
 * completely (not stored, not answered) and the owner handles them in Instagram as usual.
 * Missing setting = test phase with nobody on the list, so a fresh connection never talks to real customers.
 */
export interface TesterSetting { enabled: boolean; usernames: string[]; allowed_ids?: string[] }

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
}

export function parseUsernames(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map(normalizeUsername).filter((u) => /^[a-z0-9._]{1,30}$/.test(u)))];
}

export async function testerSetting(): Promise<TesterSetting> {
  const v = (await db().from("bot_settings").select("value").eq("key", "testers").maybeSingle()).data?.value as Partial<TesterSetting> | undefined;
  return { enabled: v?.enabled ?? true, usernames: v?.usernames ?? [], allowed_ids: v?.allowed_ids ?? [] };
}

/** May the bot handle this Instagram user? Resolves the username once, then remembers the id. */
export async function botMayHandle(igsid: string): Promise<boolean> {
  const s = await testerSetting();
  if (!s.enabled) return true;
  if (s.allowed_ids?.includes(igsid)) return true;
  if (!s.usernames.length) return false;
  const username = normalizeUsername((await userProfile(igsid).catch(() => ({} as { username?: string }))).username ?? "");
  if (!username || !s.usernames.includes(username)) return false;
  await db().from("bot_settings").upsert({ key: "testers", value: { ...s, allowed_ids: [...(s.allowed_ids ?? []), igsid] }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return true;
}
