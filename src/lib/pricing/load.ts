import "server-only";
import { db } from "../db";
import { PriceListData } from "./schema";

export interface LoadedPriceList { id: string; version: number; status: "published" | "draft"; data: PriceListData }

let cache: { at: number; list: LoadedPriceList } | null = null;

/**
 * The price list the bot quotes from: the published version, or - until the owner
 * publishes one - the latest draft (flagged so the admin can show "unapproved prices").
 */
export async function currentPriceList(): Promise<LoadedPriceList> {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  const r = await db().from("price_list_versions").select("id,version,status,data")
    .in("status", ["published", "draft"]).order("status", { ascending: false }) // 'published' > 'draft'
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new Error(`price list: ${r.error.message}`);
  if (!r.data) throw new Error("no price list in the database - run npm run db:seed");
  const list = { id: r.data.id, version: r.data.version, status: r.data.status, data: PriceListData.parse(r.data.data) } as LoadedPriceList;
  cache = { at: Date.now(), list };
  return list;
}

export function clearPriceListCache() { cache = null; }
