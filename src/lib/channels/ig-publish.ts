import "server-only";
import { db } from "../db";
import { env } from "../env";
import { absoluteUrl } from "../site";
import { notify } from "../notify";
import { settings } from "../conversation/limits";
import schedule from "@/data/ig-schedule.json";

/**
 * Scheduled Instagram posting (owner request 2026-11-13: "you will upload them all and write their
 * captions?"). src/data/ig-schedule.json lists each feed post / story with its time (Israel), the image
 * (a file under public/, served from the live site so Instagram can fetch it) and the caption. A cron
 * (src/inngest/functions.ts, every 5 min) publishes whatever is due through the Instagram Content
 * Publishing API (Instagram API with Instagram Login, same token as the DMs - it needs the
 * instagram_business_content_publish permission).
 *
 * Exactly once: each item is claimed by inserting bot_settings row `ig_post:<id>` (primary key), so a
 * second run can't post it again; the row then records the media id or the error. A failed item is
 * NOT retried (that could double-post) - the owner gets an alert and can delete the row to retry.
 * Items more than 3 hours late are skipped, never posted out of date. Pause everything with
 * bot_settings `ig_autopost` = {"paused": true}.
 */
export interface ScheduledPost {
  id: string;
  at: string; // ISO with offset
  kind: "post" | "story";
  image: string; // site path, e.g. /campaign/daily/nov13-ar-1-post.jpg
  caption?: string;
}

const LATE_LIMIT_MS = 3 * 60 * 60 * 1000;
const base = () => `https://graph.instagram.com/${env().IG_GRAPH_VERSION}`;

export function dueItems(items: ScheduledPost[], now: Date): ScheduledPost[] {
  const t = now.getTime();
  return items.filter((i) => {
    const at = Date.parse(i.at);
    return at <= t && t - at <= LATE_LIMIT_MS;
  });
}

async function graph(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env().INSTAGRAM_ACCESS_TOKEN}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

async function publishOne(item: ScheduledPost): Promise<string> {
  const account = env().INSTAGRAM_ACCOUNT_ID;
  const container = await graph(`${account}/media`, {
    method: "POST",
    body: JSON.stringify({
      image_url: absoluteUrl(item.image),
      ...(item.kind === "story" ? { media_type: "STORIES" } : { caption: item.caption ?? "" }),
    }),
  });
  const creationId = String(container.id);
  // the image is fetched by Instagram; wait (briefly) until the container is ready
  for (let i = 0; i < 10; i++) {
    const s = await graph(`${creationId}?fields=status_code`);
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`container ${s.status_code}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  const published = await graph(`${account}/media_publish`, { method: "POST", body: JSON.stringify({ creation_id: creationId }) });
  return String(published.id);
}

export async function runScheduledPosts(now = new Date()) {
  const e = env();
  if (!e.INSTAGRAM_ACCESS_TOKEN || !e.INSTAGRAM_ACCOUNT_ID) return { skipped: "instagram not connected" };
  if ((await settings<{ paused?: boolean }>("ig_autopost", {})).paused) return { skipped: "paused" };

  const results: Record<string, string> = {};
  for (const item of dueItems(schedule as ScheduledPost[], now)) {
    const key = `ig_post:${item.id}`;
    // claim: the primary key makes this a one-time insert
    const claim = await db().from("bot_settings").insert({ key, value: { status: "publishing", at: new Date().toISOString() } });
    if (claim.error) continue; // already claimed (posted, failed or in progress)
    try {
      const mediaId = await publishOne(item);
      await db().from("bot_settings").update({ value: { status: "published", media_id: mediaId, at: new Date().toISOString() } }).eq("key", key);
      results[item.id] = "published";
    } catch (err) {
      const message = (err as Error).message;
      await db().from("bot_settings").update({ value: { status: "failed", error: message, at: new Date().toISOString() } }).eq("key", key);
      await notify({
        kind: `ig.autopost_failed.${item.id}`,
        priority: "normal",
        title: `Scheduled Instagram ${item.kind} didn't post (${item.id})`,
        body: `${message}. Post it by hand from the content pack, or ask Claude to retry.`,
      }).catch(() => {});
      results[item.id] = `failed: ${message}`;
    }
  }
  return results;
}
