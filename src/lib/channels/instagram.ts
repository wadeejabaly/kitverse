import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Instagram Messaging (Instagram API with Instagram Login).
 * Endpoint shapes per Meta docs; verify the version + permissions during app setup.
 */
const base = () => `https://graph.instagram.com/${env().IG_GRAPH_VERSION}`;

export class InstagramError extends Error {
  constructor(message: string, public status: number, public code?: number, public notConnected = false) { super(message); }
}

async function post(path: string, body: unknown): Promise<{ message_id?: string; recipient_id?: string }> {
  const e = env();
  if (!e.INSTAGRAM_ACCESS_TOKEN || !e.INSTAGRAM_ACCOUNT_ID) throw new InstagramError("Instagram is not connected yet", 503, undefined, true);
  const res = await fetch(`${base()}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.INSTAGRAM_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new InstagramError(json?.error?.message ?? `HTTP ${res.status}`, res.status, json?.error?.code);
  return json;
}

/** `humanAgent` = sent by/approved by a person after the 24h window (allowed up to 7 days). */
export async function sendText(recipientId: string, text: string, humanAgent = false) {
  return post(`${env().INSTAGRAM_ACCOUNT_ID}/messages`, {
    recipient: { id: recipientId }, message: { text },
    ...(humanAgent ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
  });
}

export async function sendImage(recipientId: string, url: string, humanAgent = false) {
  return post(`${env().INSTAGRAM_ACCOUNT_ID}/messages`, {
    recipient: { id: recipientId }, message: { attachment: { type: "image", payload: { url } } },
    ...(humanAgent ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
  });
}

export async function senderAction(recipientId: string, action: "typing_on" | "mark_seen") {
  return post(`${env().INSTAGRAM_ACCOUNT_ID}/messages`, { recipient: { id: recipientId }, sender_action: action }).catch(() => ({}));
}

/** Basic profile for a new customer (name/username), best effort. */
export async function userProfile(igsid: string): Promise<{ name?: string; username?: string; error?: string }> {
  const e = env();
  if (!e.INSTAGRAM_ACCESS_TOKEN) return { error: "not connected" };
  const res = await fetch(`${base()}/${igsid}?fields=name,username`, { headers: { Authorization: `Bearer ${e.INSTAGRAM_ACCESS_TOKEN}` } });
  if (res.ok) return res.json();
  const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
  return { error: body?.error?.message ?? `HTTP ${res.status}` };
}

/** X-Hub-Signature-256 = "sha256=" + HMAC_SHA256(app secret, raw body). */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

// ---------------------------------------------------------------- webhook parsing (pure)

export interface IgEvent {
  type: "message" | "echo" | "reaction" | "read" | "referral" | "postback" | "unsupported";
  senderId: string;
  recipientId: string;
  timestamp: number;
  mid?: string;
  text?: string;
  attachments?: { type: string; url?: string; title?: string }[];
  replyToMid?: string;
  replyToStory?: { id?: string; url?: string };
  referral?: { ad_id?: string; source?: string; ad_title?: string; photo_url?: string; post_id?: string; ref?: string };
  reaction?: { action: string; emoji?: string; mid?: string };
  isDeleted?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Shape of a webhook call without any content (for logs): object, entries, event kinds and fields. */
export function describeWebhook(payload: any): string {
  const entries = payload?.entry ?? [];
  const kinds = entries.flatMap((e: any) => [
    ...(e.messaging ?? []).map((m: any) => `messaging:${Object.keys(m).filter((k) => !["sender", "recipient", "timestamp"].includes(k)).join("+")}`),
    ...(e.changes ?? []).map((c: any) => `changes:${c.field}`),
  ]);
  return `object=${payload?.object} entries=${entries.length} [${kinds.join(", ")}]`;
}

export function parseWebhook(payload: any): IgEvent[] {
  const out: IgEvent[] = [];
  for (const entry of payload?.entry ?? []) {
    // Instagram API with Instagram Login may wrap the same event as entry.changes[{ field, value }]
    const changed = (entry.changes ?? []).filter((c: any) => c?.value && (c.field === "messages" || c.field?.startsWith("messaging"))).map((c: any) => c.value);
    for (const m of [...(entry.messaging ?? []), ...changed]) {
      const base = { senderId: String(m.sender?.id ?? ""), recipientId: String(m.recipient?.id ?? ""), timestamp: Number(m.timestamp ?? Date.now()) };
      if (m.message) {
        const msg = m.message;
        const ref = msg.referral ?? m.referral;
        out.push({
          ...base,
          type: msg.is_echo ? "echo" : "message",
          mid: msg.mid, text: msg.text, isDeleted: !!msg.is_deleted,
          attachments: (msg.attachments ?? []).map((a: any) => ({ type: a.type, url: a.payload?.url, title: a.payload?.title })),
          replyToMid: msg.reply_to?.mid,
          replyToStory: msg.reply_to?.story ? { id: msg.reply_to.story.id, url: msg.reply_to.story.url } : undefined,
          referral: ref ? { ad_id: ref.ad_id, source: ref.source, ref: ref.ref, ad_title: ref.ads_context_data?.ad_title, photo_url: ref.ads_context_data?.photo_url, post_id: ref.ads_context_data?.post_id } : undefined,
        });
      } else if (m.reaction) {
        out.push({ ...base, type: "reaction", reaction: { action: m.reaction.action, emoji: m.reaction.emoji ?? m.reaction.reaction, mid: m.reaction.mid } });
      } else if (m.read) {
        out.push({ ...base, type: "read" });
      } else if (m.referral) {
        out.push({ ...base, type: "referral", referral: { ad_id: m.referral.ad_id, source: m.referral.source, ref: m.referral.ref, ad_title: m.referral.ads_context_data?.ad_title, photo_url: m.referral.ads_context_data?.photo_url, post_id: m.referral.ads_context_data?.post_id } });
      } else if (m.postback) {
        out.push({ ...base, type: "postback", text: m.postback.title ?? m.postback.payload });
      } else {
        out.push({ ...base, type: "unsupported" });
      }
    }
  }
  return out;
}
