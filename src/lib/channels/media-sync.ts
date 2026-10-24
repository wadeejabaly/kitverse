import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../env";
import { db, must } from "../db";
import { searchCatalog } from "../catalog/search";
import { notify } from "../notify";

/**
 * Pulls the shop's recent posts + live stories from Instagram, saves a copy of each image
 * (stories vanish after 24h), and suggests which catalog shirts each one shows.
 * The owner confirms suggestions in /admin/media; customer replies to that post/story then
 * arrive already linked to the right products.
 */
interface IgMedia { id: string; media_type: string; media_url?: string; thumbnail_url?: string; caption?: string; permalink?: string; timestamp?: string; children?: { data: { id: string; media_type: string; media_url?: string }[] } }

async function ig<T>(path: string): Promise<T> {
  const e = env();
  const res = await fetch(`https://graph.instagram.com/${e.IG_GRAPH_VERSION}/${path}`, { headers: { Authorization: `Bearer ${e.INSTAGRAM_ACCESS_TOKEN}` } });
  if (!res.ok) throw new Error(`instagram ${path.split("?")[0]}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function saveCopy(url: string, path: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const up = await db().storage.from("media").upload(path, Buffer.from(await r.arrayBuffer()), { contentType: r.headers.get("content-type") ?? "image/jpeg", upsert: true });
    return up.error ? null : db().storage.from("media").getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}

const KITS = ["Home", "Away", "Third", "Fourth", "Goalkeeper", "Special"] as const;

const Shirts = z.object({
  shirts: z.array(z.object({
    team: z.string(), season: z.string().nullish(), kit: z.string().nullish(),
    retro: z.boolean().default(false), confidence: z.coerce.number().min(0).max(1).default(0.5),
  })).max(8),
});

/** Ask the model which football shirts the image shows, then map each to the best catalog product. */
export async function suggestProducts(mediaId: string, imageUrl: string, caption: string | null) {
  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: env().ANTHROPIC_MODEL, max_tokens: 1500, output_config: { effort: "low" },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "url", url: imageUrl } },
      { type: "text", text: `This is a post/story from a football-shirt shop's Instagram.${caption ? ` Caption: "${caption.slice(0, 600)}"` : ""}
List the football shirts it shows (an offer poster may show ~3). For each: team (English), season like "2025/26" or "2026" if you can tell (else null), kit (Home/Away/Third/Fourth/Goalkeeper/Special or null), retro (true for 2022 and older), confidence 0-1.
Return ONLY JSON: {"shirts":[...]}. Return {"shirts":[]} if no specific shirt is visible.` },
    ] }],
  });
  const text = r.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = Shirts.safeParse(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) || "{}"));
  if (!parsed.success) return 0;
  let n = 0;
  for (const [i, s] of parsed.data.shirts.entries()) {
    const kit = KITS.find((k) => k.toLowerCase() === (s.kit ?? "").toLowerCase()) ?? null;
    const era = s.retro ? "retro" as const : "current" as const;
    // the model's season guess is often off by one: fall back to the newest matching kit
    const p = (await searchCatalog({ team: s.team, season: s.season, kit, era, limit: 1 })).products[0]
      ?? (await searchCatalog({ team: s.team, kit, era, limit: 1 })).products[0]
      ?? (await searchCatalog({ team: s.team, era, limit: 1 })).products[0];
    if (!p) continue;
    await db().from("ig_media_products").upsert({ ig_media_id: mediaId, product_id: p.id, carousel_index: parsed.data.shirts.length > 1 ? i + 1 : null, confidence: Math.min(1, s.confidence) * (p.season === s.season ? 1 : 0.8), status: "suggested" }, { onConflict: "ig_media_id,product_id,carousel_index", ignoreDuplicates: true });
    n++;
  }
  return n;
}

export async function syncInstagramMedia(): Promise<{ posts: number; stories: number; suggested: number }> {
  const e = env();
  if (!e.INSTAGRAM_ACCESS_TOKEN || !e.INSTAGRAM_ACCOUNT_ID) return { posts: 0, stories: 0, suggested: 0 };
  const fields = "id,media_type,media_url,thumbnail_url,caption,permalink,timestamp,children{id,media_type,media_url}";
  const posts = (await ig<{ data: IgMedia[] }>(`${e.INSTAGRAM_ACCOUNT_ID}/media?fields=${fields}&limit=25`)).data ?? [];
  const stories = (await ig<{ data: IgMedia[] }>(`${e.INSTAGRAM_ACCOUNT_ID}/stories?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp`).catch(() => ({ data: [] }))).data ?? [];
  let suggested = 0;
  const known = new Set(((await db().from("ig_media").select("id").in("id", [...posts, ...stories].map((m) => m.id))).data ?? []).map((r) => r.id));
  for (const [kind, list] of [["post", posts], ["story", stories]] as const) {
    for (const m of list) {
      if (known.has(m.id)) continue;
      const src = m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url ?? m.children?.data[0]?.media_url;
      const copy = src ? await saveCopy(src, `ig/${kind}-${m.id}.jpg`) : null;
      const isReel = m.media_type === "VIDEO" && kind === "post";
      must(await db().from("ig_media").upsert({
        id: m.id, kind: isReel ? "reel" : kind, permalink: m.permalink ?? null, shortcode: m.permalink?.split("/").filter(Boolean).pop() ?? null,
        caption: m.caption ?? null, image_url: copy, posted_at: m.timestamp ?? null,
        expires_at: kind === "story" && m.timestamp ? new Date(new Date(m.timestamp).getTime() + 24 * 3600_000).toISOString() : null,
      }, { onConflict: "id" }).select("id"), "save ig media");
      for (const child of m.children?.data ?? []) {
        const cc = child.media_url ? await saveCopy(child.media_url, `ig/item-${child.id}.jpg`) : null;
        await db().from("ig_media").upsert({ id: child.id, kind: "carousel_item", parent_id: m.id, image_url: cc }, { onConflict: "id" });
      }
      if (copy) suggested += await suggestProducts(m.id, copy, m.caption ?? null).catch(() => 0);
    }
  }
  if (suggested) await notify({ kind: "media.suggested", priority: "quiet", title: "New posts: confirm which shirts they show", link: "/admin/media" });
  return { posts: posts.length, stories: stories.length, suggested };
}
