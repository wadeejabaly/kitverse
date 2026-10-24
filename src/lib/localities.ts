import "server-only";
import { db, must } from "./db";
import { similarity, looseTokens } from "./text";

export interface Locality { id: string; name_en: string; name_ar: string | null; name_he: string | null; aliases: string[]; zone_id: string }

let cache: { at: number; rows: Locality[] } | null = null;

async function all(): Promise<Locality[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.rows;
  const rows = must(await db().from("localities").select("id,name_en,name_ar,name_he,aliases,zone_id").limit(5000), "localities") as Locality[];
  cache = { at: Date.now(), rows };
  return rows;
}

/** Town as typed by the customer -> known locality + zone. null = unknown town (ask owner / customer). */
export async function resolveTown(town: string): Promise<{ locality: Locality; score: number } | null> {
  const q = looseTokens(town).join(" ");
  let best: { locality: Locality; score: number } | null = null;
  for (const l of await all()) {
    for (const n of [l.name_en, l.name_ar, l.name_he, ...l.aliases].filter(Boolean) as string[]) {
      const s = Math.max(similarity(n, town), similarity(looseTokens(n).join(" "), q));
      if (!best || s > best.score) best = { locality: l, score: s };
    }
  }
  return best && best.score >= 0.8 ? best : null;
}
