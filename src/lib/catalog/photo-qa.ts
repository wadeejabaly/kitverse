import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../env";
import { logAiUsage } from "../ai-cost";
import { db, must } from "../db";
import { albumPhotoHashes } from "./images";

/**
 * Photo quality gate. Supplier photos often carry Chinese labels, prices, watermarks or messy
 * backgrounds - those must never reach a customer. Every candidate photo is screened by a small
 * vision model; the first clean one becomes the product photo. If all are labelled, we try cropping
 * to the shirt. If nothing is clean, the product gets no photo (the owner can upload one).
 */
const QA_MODEL = process.env.PHOTO_QA_MODEL ?? "claude-haiku-4-5";
const SUPPLIER = "https://jerseyxie.x.yupoo.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

const Assessment = z.object({
  shows_shirt: z.boolean(),
  front_view: z.boolean(),
  overlay_text: z.boolean(),          // any added text/labels/prices/Chinese characters (not the shirt's own print)
  watermark: z.boolean(),
  messy_background: z.boolean(),
  blurry_or_dark: z.boolean(),
  score: z.coerce.number().min(1).max(5), // how attractive for a customer
  shirt_box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(), // fractions 0-1
  overlay_outside_shirt: z.boolean(),
  matches_expected: z.boolean().nullable().default(null), // the shirt is the expected team/kit (null = not asked)
  baby_bodysuit: z.boolean().default(false),   // romper/onesie for babies - never shown
  kids_item: z.boolean().default(false),       // small children's kit
  other_garments: z.boolean().optional(),      // shorts/socks/another garment next to the shirt (undefined = checked before this existed)
  text_boxes: z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })).default([]), // added text/watermarks
});
export type Assessment = z.infer<typeof Assessment>;

export type PhotoAudience = "adult" | "kids";

export const isClean = (a: Assessment, audience: PhotoAudience = "adult") =>
  a.shows_shirt && !a.overlay_text && !a.watermark && !a.blurry_or_dark && a.score >= 3 &&
  !a.baby_bodysuit && (audience === "kids" || (!a.kids_item && !a.other_garments)) && a.matches_expected !== false;

let client: Anthropic | null = null;

export async function assessPhoto(url: string, expected?: string): Promise<Assessment | null> {
  const a = await assessQuality(url);
  if (!a || !expected || !isClean({ ...a, matches_expected: null }, "kids") || !a.front_view) return a;
  // identity: the supplier sometimes files another club's shirt under a team's album
  return { ...a, matches_expected: await confirmTeam(url, expected) };
}

/** Strong model, focused question: does the crest belong to the expected team? (cheap model misreads crests) */
async function confirmTeam(url: string, expected: string): Promise<boolean | null> {
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 3 });
  const r = await client.messages.create({
    model: env().ANTHROPIC_MODEL, max_tokens: 300, output_config: { effort: "low" },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "url", url } },
      { type: "text", text: `Is this ${expected.replace(/^a /, "a ")}? Look closely at the crest/badge and the sponsor. Don't judge the season or whether it's the home/away design - only whether it is that team. Answer ONLY JSON: {"crest_seen":"<team the crest belongs to>","is_team":true|false}` },
    ] }],
  });
  await logAiUsage("photo_check", env().ANTHROPIC_MODEL, r.usage);
  const t = r.content.find((b) => b.type === "text")?.text ?? "";
  const m = t.match(/"is_team"\s*:\s*(true|false)/);
  return m ? m[1] === "true" : null;
}

async function assessQuality(url: string): Promise<Assessment | null> {
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 3 });
  const r = await client.messages.create({
    model: QA_MODEL, max_tokens: 400,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "url", url } },
      { type: "text", text: `You check product photos for a football-shirt shop before they are sent to customers on Instagram.
Judge ONLY what was added to the photo, not the shirt's own design (crests, sponsors, numbers printed on the shirt are fine).
Return ONLY JSON:
{"shows_shirt":bool,"front_view":bool,"overlay_text":bool (any text/labels/prices/Chinese or other characters ADDED on top of the photo, e.g. "2021巴西客场"),"watermark":bool,"messy_background":bool,"blurry_or_dark":bool,"score":1-5 (how attractive and professional for a customer),"shirt_box":{"x":0-1,"y":0-1,"w":0-1,"h":0-1} or null (tight box around the shirt, as fractions of width/height),"overlay_outside_shirt":bool (true if all added text/watermarks are outside the shirt box),"text_boxes":[{"x":0-1,"y":0-1,"w":0-1,"h":0-1}] (one generous box around each piece of ADDED text or watermark; [] if none),"baby_bodysuit":bool (a baby romper/onesie with snaps between the legs),"kids_item":bool (a small children's shirt/kit rather than an adult shirt),"other_garments":bool (shorts, socks, a second shirt or any other clothing visible besides the one shirt; a mannequin, hanger or rack is fine)}` },
    ] }],
  });
  await logAiUsage("photo_check", QA_MODEL, r.usage);
  const text = r.content.find((b) => b.type === "text")?.text ?? "";
  try {
    return Assessment.parse({ ...JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)), matches_expected: null });
  } catch { return null; }
}

export async function fetchBuffer(url: string, supplier: boolean): Promise<Buffer | null> {
  try {
    const res = await fetch(url, supplier ? { headers: { "User-Agent": UA, Referer: `${SUPPLIER}/` } } : undefined);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch { return null; }
}

export async function upload(path: string, buf: Buffer): Promise<string> {
  const up = await db().storage.from("media").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`upload ${path}: ${up.error.message}`);
  return db().storage.from("media").getPublicUrl(path).data.publicUrl;
}

/**
 * Supplier photos often show the shirt next to its shorts. Fallback when an album has no shirt-only
 * photo: crop to the shirt (generous margin); the result is checked again before it is used.
 */
export async function frameShirt(buf: Buffer, box: NonNullable<Assessment["shirt_box"]>): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  const m = 0.05; // shirt boxes are rough - keep the sleeves
  const left = Math.max(0, Math.floor((box.x - m) * width));
  const top = Math.max(0, Math.floor((box.y - m) * height));
  const w = Math.min(width - left, Math.ceil((box.w + 2 * m) * width));
  const h = Math.min(height - top, Math.ceil((box.h + 2 * m) * height));
  // no padding: the site shows photos "contain" on a white tile and Instagram takes any ratio
  return sharp(buf).extract({ left, top, width: w, height: h })
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 }).toBuffer();
}

type Box = { x: number; y: number; w: number; h: number };
const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
const intersect = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
};

/**
 * Cut away the strip(s) holding labels: for each label, trim the image edge it sits next to
 * (top/bottom/left/right) - whichever keeps the most of the shirt. Returns null if that would
 * lose more than 8% of the shirt.
 */
export function planCut(shirt: Box, labels: Box[]): Box | null {
  let crop: Box = { x: 0, y: 0, w: 1, h: 1 };
  const pad = 0.012;
  for (const t of labels) {
    const options: Box[] = [
      { ...crop, y: Math.max(crop.y, t.y + t.h + pad), h: crop.y + crop.h - Math.max(crop.y, t.y + t.h + pad) },         // cut top
      { ...crop, h: Math.min(crop.y + crop.h, t.y - pad) - crop.y },                                                     // cut bottom
      { ...crop, x: Math.max(crop.x, t.x + t.w + pad), w: crop.x + crop.w - Math.max(crop.x, t.x + t.w + pad) },         // cut left
      { ...crop, w: Math.min(crop.x + crop.w, t.x - pad) - crop.x },                                                     // cut right
    ].filter((o) => o.w > 0.2 && o.h > 0.2);
    if (!options.length) return null;
    crop = options.sort((a, b) => area(intersect(b, shirt)) - area(intersect(a, shirt)))[0];
  }
  return area(intersect(crop, shirt)) / area(shirt) >= 0.92 ? crop : null;
}

interface ProductRef { id: string; handle: string; primary_image_url: string | null; supplier_cover: string | null; photo_status?: string }

export async function record(productId: string, url: string, status: "good" | "bad" | "cropped", a: Assessment | null, extra: { source: string; hash?: string; album?: string }) {
  await db().from("product_images").upsert({
    product_id: productId, url, status, quality: a, checked_at: new Date().toISOString(),
    source: extra.source, supplier_hash: extra.hash ?? null, album_id: extra.album ?? null, role: a?.front_view === false ? "other" : "front",
  }, { onConflict: "product_id,url" });
}

/**
 * The product photo customers may see: an already-approved one, or a previously-approved candidate
 * still sitting in product_images. Never fetches anything new from the supplier (owner decision
 * 2026-11-02, Part 9: "i dont want the pictures to be bas[ed] on supplier link ... i dont want his
 * catalog or pictures anymore") - a product with nothing already approved simply has no photo until
 * the owner uploads one in admin, same as any other product with no clean photo today.
 */
export async function bestProductPhoto(p: ProductRef, opts: { audience?: PhotoAudience } = {}): Promise<string | null> {
  const audience = opts.audience ?? "adult";
  const adult = audience === "adult";
  // 1) already decided (adult main photo is cached on the product)
  if (adult) {
    if ((p.photo_status === "owner_upload" || p.photo_status === "good") && p.primary_image_url) return p.primary_image_url;
    return null;
  }
  // 2) kids: whatever was already approved for this product, if anything
  const seen = must(await db().from("product_images").select("url,status,quality").eq("product_id", p.id).eq("status", "good"), "seen") as { url: string; status: string; quality: Assessment | null }[];
  const reuse = seen.find((s) => s.quality && isClean(s.quality, audience) && s.quality.front_view !== false);
  return reuse?.url ?? null;
}

/** "Barcelona 2026/27 Home shirt" - what the photo must show (used to catch the supplier's mislabelled albums). */
async function describe(productId: string): Promise<string> {
  const r = (await db().from("products").select("title_en,kit,season,team:teams(name_en,type)").eq("id", productId).maybeSingle()).data as { title_en: string; kit: string; season: string | null; team: { name_en: string; type: string } | null } | null;
  if (!r) return "";
  const kit = ["Special", "Unstated"].includes(r.kit) ? "" : ` ${r.kit.toLowerCase()} kit`;
  void kit;
  return `a ${r.team?.name_en ?? ""} ${r.team?.type === "national" ? "national team " : ""}football shirt`.replace(/\s+/g, " ");
}

/** Clean extra photos (back, details) of a product for "send me more pictures". */
export async function cleanAlbumPhotos(p: ProductRef, albumId: string, max = 3): Promise<string[]> {
  const hashes = await albumPhotoHashes(albumId, 8).catch(() => [] as string[]);
  const out: string[] = [];
  for (const h of hashes) {
    if (out.length >= max) break;
    const prior = (await db().from("product_images").select("url,status").eq("product_id", p.id).eq("supplier_hash", h).maybeSingle()).data;
    if (prior) { if (prior.status === "good" || prior.status === "cropped") out.push(prior.url); continue; }
    const buf = await fetchBuffer(`https://photo.yupoo.com/jerseyxie/${h}/big.jpg`, true);
    if (!buf || buf.length < 5000) continue;
    const url = await upload(`products/${p.handle}/s-${h}.jpg`, buf);
    const a = await assessPhoto(url, await describe(p.id));
    const good = !!a && isClean(a, "adult");
    await record(p.id, url, good ? "good" : "bad", a, { source: "supplier", hash: h, album: albumId });
    if (good) out.push(url);
  }
  return out;
}
