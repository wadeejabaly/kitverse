import "server-only";
import webpush from "web-push";
import { db, must } from "./db";
import { env } from "./env";

export type Priority = "urgent" | "normal" | "quiet";

/**
 * Admin notification: stored for the bell / "needs me" list, and pushed to the
 * owner's phone (urgent + normal) when push is configured. Never throws on push failure.
 */
export async function notify(n: { kind: string; title: string; body?: string; link?: string; priority?: Priority }) {
  const priority = n.priority ?? "normal";
  must(await db().from("notifications").insert({ kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, priority }).select("id"), "notify");
  if (priority === "quiet") return;
  const e = env();
  if (!e.VAPID_PRIVATE_KEY || !e.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
  webpush.setVapidDetails(e.VAPID_SUBJECT || "https://www.instagram.com/kitversejerseys", e.NEXT_PUBLIC_VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
  const subs = must(await db().from("push_subscriptions").select("id,endpoint,keys"), "push subs") as { id: string; endpoint: string; keys: { p256dh: string; auth: string } }[];
  const payload = JSON.stringify({ title: n.title, body: n.body ?? "", link: n.link ?? "/admin", urgent: priority === "urgent" });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { urgency: priority === "urgent" ? "high" : "normal", TTL: 3600 });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db().from("push_subscriptions").delete().eq("id", s.id); // expired subscription
    }
  }));
}
