import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { db, must } from "../db";

export interface MessageRow {
  id: string; direction: "in" | "out"; sender: "customer" | "bot" | "owner" | "system"; kind: string;
  text: string | null; transcript: string | null; media: { url?: string; title?: string; ad_title?: string; emoji?: string }[] | null;
  ig_media_id: string | null; product_ids: string[]; status: string; created_at: string;
  ig_message_id?: string | null; reply_to_ig_message_id?: string | null;
  reply_to?: Pick<MessageRow, "direction" | "kind" | "text" | "transcript" | "product_ids"> | null; // the message a customer replied/reacted to
}

const COLS = "id,direction,sender,kind,text,transcript,media,ig_media_id,product_ids,status,created_at,ig_message_id,reply_to_ig_message_id";

export async function recentMessages(conversationId: string, limit = 40): Promise<MessageRow[]> {
  const rows = (must(await db().from("messages").select(COLS)
    .eq("conversation_id", conversationId).in("status", ["received", "sent", "queued"]).order("created_at", { ascending: false }).limit(limit), "messages") as MessageRow[]).reverse();
  // swipe-replies and reactions point at a message by its Instagram id; resolve it (older ones too)
  const byMid = new Map(rows.filter((r) => r.ig_message_id).map((r) => [r.ig_message_id!, r]));
  const missing = [...new Set(rows.map((r) => r.reply_to_ig_message_id).filter((mid): mid is string => !!mid && !byMid.has(mid)))];
  if (missing.length) {
    const older = must(await db().from("messages").select(COLS).eq("conversation_id", conversationId).in("ig_message_id", missing), "replied-to messages") as MessageRow[];
    older.forEach((r) => byMid.set(r.ig_message_id!, r));
  }
  for (const r of rows) if (r.reply_to_ig_message_id) r.reply_to = byMid.get(r.reply_to_ig_message_id) ?? null;
  return rows;
}

type Block = Anthropic.Beta.BetaContentBlockParam;

/** What a reply/reaction points at, e.g. 'your photo of Barcelona home 2025/26 (product_id …)'. */
function replyTarget(m: MessageRow, titles: Map<string, string>): string {
  const r = m.reply_to;
  if (!r) return "an earlier message";
  const quote = (s: string | null) => (s ? ` "${s.replace(/\s*\n\s*/g, " / ").slice(0, 120)}"` : "");
  if (r.direction === "in") return `their own earlier message${quote(r.text ?? r.transcript)}`;
  if (r.kind === "image") return r.product_ids.length ? `your photo of ${r.product_ids.map((id) => `${titles.get(id) ?? "product"} (product_id ${id})`).join(", ")}` : "a photo you sent";
  return `your message${quote(r.text)}`;
}

function customerBlocks(m: MessageRow, withImages: boolean, productTitles: Map<string, string>): Block[] {
  const blocks = contentBlocks(m, withImages, productTitles);
  return m.reply_to_ig_message_id && m.kind !== "reaction" ? [{ type: "text", text: `[replying to ${replyTarget(m, productTitles)}]` }, ...blocks] : blocks;
}

function contentBlocks(m: MessageRow, withImages: boolean, productTitles: Map<string, string>): Block[] {
  const t = (s: string): Block => ({ type: "text", text: s });
  const media = m.media ?? [];
  const img = (): Block[] => (withImages ? media.filter((x) => x.url).map((x) => ({ type: "image", source: { type: "url", url: x.url! } }) as Block) : []);
  switch (m.kind) {
    case "image": return [...img(), t(`[sent a photo]${m.text ? " " + m.text : ""}`)];
    case "video": return [t(`[sent a video]${m.text ? " " + m.text : ""}`)];
    case "audio": return [t(m.transcript ? `[voice note] ${m.transcript}` : "[voice note - could not be transcribed]")];
    case "story_reply": return [...img(), t(`[replied to your story${linked(m, productTitles)}] ${m.text ?? ""}`.trim())];
    case "story_mention": return [t("[mentioned the shop in their story]")];
    case "share": return [...img(), t(`[shared a post${media[0]?.title ? `: "${media[0].title.slice(0, 200)}"` : ""}${linked(m, productTitles)}] ${m.text ?? ""}`.trim())];
    case "reaction": return [t(`[reacted ${media[0]?.emoji ?? "👍"} to ${m.reply_to_ig_message_id ? replyTarget(m, productTitles) : "a message"}]`)];
    case "ad_referral": return [t(`[came from the ad${media[0]?.ad_title ? ` "${media[0].ad_title}"` : ""}${linked(m, productTitles)}] ${m.text ?? ""}`.trim())];
    default: return [t(m.text ?? "")];
  }
}

function linked(m: MessageRow, titles: Map<string, string>): string {
  const names = m.product_ids.map((id) => titles.get(id)).filter(Boolean);
  return names.length ? ` showing: ${names.join(" | ")}` : "";
}

/**
 * DB messages -> API messages. Customer = user; bot/owner = assistant (owner lines are tagged so the
 * model knows the owner stepped in). Only the last few customer photos are sent as images.
 */
export function toApiMessages(rows: MessageRow[], productTitles: Map<string, string>): Anthropic.Beta.BetaMessageParam[] {
  const imageBudgetFrom = (() => {
    let left = 4, idx = rows.length;
    for (let i = rows.length - 1; i >= 0 && left > 0; i--) if (rows[i].direction === "in" && rows[i].media?.some((x) => x.url)) { left--; idx = i; }
    return idx;
  })();
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  rows.forEach((m, i) => {
    if (m.sender === "system") return;
    const role = m.direction === "in" ? "user" : "assistant";
    let blocks: Block[];
    if (role === "user") blocks = customerBlocks(m, i >= imageBudgetFrom, productTitles);
    else if (m.kind === "image") blocks = [{ type: "text", text: `[sent photo${m.product_ids.length ? ": " + m.product_ids.map((id) => `${productTitles.get(id) ?? "product"} (product_id ${id})`).join(", ") : ""}]` }];
    else blocks = [{ type: "text", text: (m.sender === "owner" ? "[owner wrote] " : "") + (m.text ?? "") }];
    blocks = blocks.filter((b) => b.type !== "text" || (b as { text: string }).text.trim());
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) (last.content as Block[]).push(...blocks);
    else out.push({ role, content: blocks });
  });
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
