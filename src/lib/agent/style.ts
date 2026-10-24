import "server-only";
import { db, must } from "../db";
import { looseTokens } from "../text";

export interface StyleExample { situation: string; customer_text: string; owner_reply: string }

let cache: { at: number; rows: (StyleExample & { tokens: Set<string> })[] } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.rows;
  const rows: (StyleExample & { tokens: Set<string> })[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await db().from("style_examples").select("situation,customer_text,owner_reply").range(from, from + 999), "style") as StyleExample[];
    rows.push(...page.map((r) => ({ ...r, tokens: new Set(looseTokens(r.customer_text ?? "")) })));
    if (page.length < 1000) break;
  }
  cache = { at: Date.now(), rows };
  return rows;
}

const SITUATION_HINTS: [string, RegExp][] = [
  ["haggling", /خصم|بتنزل|غالي|ارخص|حسم/], ["quality_original", /جود|اصلي|اورجينال|تقليد/],
  ["delay_status", /صار مع|تأخر|تاخر|وين الطلب|وصلت/], ["sizing", /مقاس|نمر|طول|وزن|ضيق/],
  ["delivery", /توصيل|شحن|لوين|كم يوم/], ["payment", /كاش|bit|بيت|فيزا|دفع/i], ["price", /قديش|سعر|بكم|كم حق/],
  ["printing_patches", /اسم|رقم|شار|رقع/], ["washing", /غسيل|اغسل/], ["photos", /صور/],
];

/** A few real owner replies to situations like this one - shown to the model as voice references. */
export async function styleExamples(customerText: string, k = 5): Promise<StyleExample[]> {
  const rows = await load();
  const q = new Set(looseTokens(customerText));
  const situation = SITUATION_HINTS.find(([, re]) => re.test(customerText))?.[0];
  const scored = rows.map((r) => {
    let overlap = 0;
    for (const t of q) if (t.length > 1 && r.tokens.has(t)) overlap++;
    return { r, score: overlap / Math.sqrt(1 + r.tokens.size) + (situation && r.situation === situation ? 0.6 : 0) };
  }).sort((a, b) => b.score - a.score);
  const picked: StyleExample[] = [];
  const seen = new Set<string>();
  for (const { r } of scored) {
    if (seen.has(r.owner_reply)) continue;
    seen.add(r.owner_reply);
    picked.push({ situation: r.situation, customer_text: r.customer_text, owner_reply: r.owner_reply });
    if (picked.length >= k) break;
  }
  return picked;
}
