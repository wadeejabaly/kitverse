import "server-only";
import { db, must } from "../db";
import { notify } from "../notify";
import { userProfile, type IgEvent } from "../channels/instagram";
import type { ConversationRow, CustomerRow } from "../agent/state";

type Channel = "instagram" | "simulator";

export async function getOrCreateConversation(channel: Channel, externalUserId: string, profile: { name?: string; username?: string } = {}) {
  const igId = channel === "instagram" ? externalUserId : `sim:${externalUserId}`;
  let customer = (await db().from("customers").select("*").eq("ig_user_id", igId).maybeSingle()).data as CustomerRow | null;
  if (!customer) {
    if (channel === "instagram" && !profile.name && !profile.username) profile = await userProfile(externalUserId).catch(() => ({}));
    customer = must(await db().from("customers").insert({ ig_user_id: igId, ig_username: profile.username ?? null, display_name: profile.name ?? null })
      .select("*").single(), "create customer") as CustomerRow;
  }
  let conv = (await db().from("conversations").select("*").eq("customer_id", customer.id).eq("channel", channel).maybeSingle()).data as ConversationRow | null;
  if (!conv) {
    const autonomy = (await db().from("bot_settings").select("value").eq("key", "autonomy").maybeSingle()).data?.value as { mode?: string } | undefined;
    // test chats always answer directly; real chats follow the autonomy setting (draft = owner approves each reply)
    const mode = channel === "simulator" || autonomy?.mode === "auto" ? "bot" : "draft";
    conv = must(await db().from("conversations").insert({ customer_id: customer.id, channel, mode })
      .select("*").single(), "create conversation") as ConversationRow;
  }
  return { customer, conv };
}

/** Copy a temporary Instagram CDN file into our storage (IG URLs expire). */
async function mirrorMedia(url: string, path: string): Promise<{ url: string; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) return null;
    const up = await db().storage.from("media").upload(path, buf, { contentType, upsert: true });
    if (up.error) return null;
    return { url: db().storage.from("media").getPublicUrl(path).data.publicUrl, contentType };
  } catch { return null; }
}

/** Products linked to an Instagram post/story/ad (confirmed first, then suggestions). */
async function linkedProducts(igMediaId: string | null | undefined): Promise<string[]> {
  if (!igMediaId) return [];
  const rows = must(await db().from("ig_media_products").select("product_id,status").eq("ig_media_id", igMediaId).neq("status", "rejected"), "linked products") as { product_id: string; status: string }[];
  return rows.sort((a) => (a.status === "confirmed" ? -1 : 1)).map((r) => r.product_id);
}

export interface InboundResult { conversationId: string; messageId: string | null; trigger: boolean }

/** Store one customer event. `trigger` = the bot should take a turn (debounced by the caller). */
export async function storeInbound(channel: Channel, ev: IgEvent): Promise<InboundResult> {
  const { conv } = await getOrCreateConversation(channel, ev.senderId);
  if (ev.mid) {
    const dup = await db().from("messages").select("id").eq("ig_message_id", ev.mid).maybeSingle();
    if (dup.data) return { conversationId: conv.id, messageId: dup.data.id, trigger: false }; // webhook retry
  }
  const now = new Date(ev.timestamp || Date.now());
  let kind = "text"; let igMediaId: string | null = null;
  const media: Record<string, string | undefined>[] = [];

  if (ev.type === "reaction") {
    kind = "reaction"; media.push({ emoji: ev.reaction?.emoji, action: ev.reaction?.action });
  } else if (ev.replyToStory) {
    kind = "story_reply"; igMediaId = ev.replyToStory.id ?? null;
    const m = ev.replyToStory.url ? await mirrorMedia(ev.replyToStory.url, `inbound/${conv.id}/story-${igMediaId ?? ev.mid}.jpg`) : null;
    if (m) media.push({ url: m.url });
    if (igMediaId) await db().from("ig_media").upsert({ id: igMediaId, kind: "story", image_url: m?.url ?? null }, { onConflict: "id", ignoreDuplicates: true });
  } else if (ev.referral?.ad_id || ev.referral?.source === "ADS") {
    kind = "ad_referral"; media.push({ ad_id: ev.referral.ad_id, ad_title: ev.referral.ad_title });
    if (ev.referral.ad_id) {
      const ad = (await db().from("ads").select("ig_media_id").eq("ad_id", ev.referral.ad_id).maybeSingle()).data;
      igMediaId = ad?.ig_media_id ?? ev.referral.post_id ?? null;
      if (!ad) await db().from("ads").upsert({ ad_id: ev.referral.ad_id, name: ev.referral.ad_title ?? null }, { onConflict: "ad_id", ignoreDuplicates: true });
    }
  }
  for (const a of ev.attachments ?? []) {
    if (a.type === "image" && a.url) {
      kind = kind === "text" ? "image" : kind;
      const m = await mirrorMedia(a.url, `inbound/${conv.id}/${ev.mid ?? Date.now()}-${media.length}.jpg`);
      media.push({ url: m?.url ?? a.url });
    } else if (a.type === "audio" && a.url) {
      kind = "audio";
      const m = await mirrorMedia(a.url, `inbound/${conv.id}/${ev.mid ?? Date.now()}.mp4`);
      media.push({ url: m?.url ?? a.url, audio: "1" });
    } else if (a.type === "video" && a.url) {
      kind = "video"; media.push({ url: undefined, video: a.url });
    } else if ((a.type === "share" || a.type === "ig_reel" || a.type === "ig_post") && a.url) {
      kind = "share"; media.push({ url: a.url, title: a.title });
    } else if (a.type === "story_mention") {
      kind = "story_mention";
    }
  }
  const product_ids = await linkedProducts(igMediaId);

  const msg = must(await db().from("messages").insert({
    conversation_id: conv.id, direction: "in", sender: "customer", ig_message_id: ev.mid ?? null, kind,
    text: ev.text ?? null, media: media.length ? media : null, ig_media_id: igMediaId, product_ids, status: "received", created_at: now.toISOString(),
  }).select("id").single(), "store inbound") as { id: string };

  const patch: Record<string, unknown> = { last_customer_msg_at: now.toISOString(), window_expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString() };
  if (!conv.source_type) {
    patch.source_type = kind === "ad_referral" ? "ad" : kind === "story_reply" ? "story" : kind === "share" ? "post" : "organic";
    patch.source_ref = igMediaId ?? ev.referral?.ad_id ?? null;
  }
  must(await db().from("conversations").update(patch).eq("id", conv.id).select("id"), "touch conversation");
  // reactions trigger too: a 👍 on "نثبت الطلبية؟" is a yes; the bot answers <no_reply> when nothing is needed
  return { conversationId: conv.id, messageId: msg.id, trigger: !(kind === "reaction" && ev.reaction?.action === "unreact") };
}

/**
 * The owner typed in Instagram himself (echo that we didn't send): store it and pause the bot
 * for this chat for 12h so they don't talk over each other.
 */
/** Plain system message sent when a tester joins with the code word (its echo must not pause the bot). */
export const JOIN_CONFIRMATION = "✅ Test mode: you're connected to the Kitverse bot. Send your question now.";

export async function storeOwnerEcho(ev: IgEvent) {
  if (ev.mid) {
    const ours = await db().from("messages").select("id").eq("ig_message_id", ev.mid).maybeSingle();
    if (ours.data) return; // echo of a message the bot/admin sent
  }
  if (ev.text === JOIN_CONFIRMATION) return; // our own test-mode confirmation
  const { conv } = await getOrCreateConversation("instagram", ev.recipientId);
  // the echo can arrive before the sender saved Instagram's message id: match a just-sent bot/admin message by text
  if (ev.text) {
    const recent = (await db().from("messages").select("id").eq("conversation_id", conv.id).eq("direction", "out").neq("sender", "owner")
      .eq("text", ev.text).is("ig_message_id", null).gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString()).limit(1).maybeSingle()).data;
    if (recent) {
      await db().from("messages").update({ ig_message_id: ev.mid ?? null }).eq("id", recent.id);
      return;
    }
  }
  must(await db().from("messages").insert({
    conversation_id: conv.id, direction: "out", sender: "owner", ig_message_id: ev.mid ?? null, kind: ev.attachments?.length ? "image" : "text",
    text: ev.text ?? null, status: "sent",
  }).select("id"), "store owner echo");
  if (conv.mode === "bot" || conv.mode === "draft") {
    must(await db().from("conversations").update({ mode: "owner", mode_until: new Date(Date.now() + 12 * 3600_000).toISOString() }).eq("id", conv.id).select("id"), "owner takeover");
    await notify({ kind: "conversation.owner_took_over", priority: "quiet", title: "Bot paused in this chat because you replied", link: `/admin/inbox/${conv.id}` });
  }
}
