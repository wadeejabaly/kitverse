import "server-only";
import { db, must } from "../db";
import { normalizeSeason } from "../text";
import { resolveTeam, type Team } from "./teams";

export type Kit = "Home" | "Away" | "Third" | "Fourth" | "Goalkeeper" | "Special" | "Unstated";

export interface ProductOption {
  id: string;
  audience: "adult" | "women" | "kids";
  version: "fan" | "player";
  sleeve: "short" | "long";
  sizes: string[] | null;
}

export interface ProductHit {
  id: string;
  handle: string;
  title_en: string;
  title_ar: string | null;
  team_id: string;
  season: string | null;
  kit: Kit;
  era: "current" | "retro";
  status: "featured" | "available" | "on_request" | "hidden";
  is_kit_with_shorts: boolean;
  flags: string[];
  primary_image_url: string | null;
  supplier_cover: string | null;
  photo_status: "unchecked" | "good" | "none_clean" | "owner_upload";
  options: ProductOption[];
}

export interface SearchInput {
  team: string;                 // as the customer/model wrote it
  season?: string | null;       // "25/26", "2026", "last season" handled by the model
  kit?: Kit | null;
  era?: "current" | "retro" | null;
  audience?: "adult" | "women" | "kids" | null;
  limit?: number;
}

const SELECT = "id,handle,title_en,title_ar,team_id,season,kit,era,status,is_kit_with_shorts,flags,primary_image_url,supplier_cover,photo_status," +
  "options:product_options(id,audience,version,sleeve,sizes,is_active)";

const statusRank = { featured: 0, available: 1, on_request: 2, hidden: 3 } as const;
const kitRank: Record<string, number> = { Home: 0, Away: 1, Third: 2, Fourth: 3, Special: 4, Goalkeeper: 5, Unstated: 6 };

/**
 * Catalog search used by the bot. Returns the closest products plus the teams it matched,
 * newest seasons first. Never returns hidden products.
 */
export async function searchCatalog(input: SearchInput): Promise<{ teams: Team[]; products: ProductHit[]; note?: string }> {
  const ranked = await resolveTeam(input.team);
  if (!ranked.length) return { teams: [], products: [], note: "team_not_found" };
  // take the clear winner, or the few close ones when ambiguous ("inter" -> Inter Milan / Inter Miami)
  const top = ranked[0].score;
  const teams = ranked.filter((r) => r.score >= top - 0.05).slice(0, 3).map((r) => r.team);

  let q = db().from("products").select(SELECT).in("team_id", teams.map((t) => t.id)).neq("status", "hidden");
  const season = normalizeSeason(input.season ?? null);
  if (season) q = q.eq("season", season);
  if (input.kit) q = q.eq("kit", input.kit);
  if (input.era) q = q.eq("era", input.era);
  const rows = must(await q.limit(400), "searchCatalog") as unknown as (Omit<ProductHit, "options"> & { options: (ProductOption & { is_active: boolean })[] })[];

  const products = rows
    .map((p) => ({ ...p, options: p.options.filter((o) => o.is_active) }))
    .filter((p) => !input.audience || p.options.some((o) => o.audience === input.audience))
    .sort((a, b) =>
      (b.season ?? "").localeCompare(a.season ?? "") ||
      statusRank[a.status] - statusRank[b.status] ||
      (kitRank[a.kit] ?? 9) - (kitRank[b.kit] ?? 9))
    .slice(0, input.limit ?? 8);

  return { teams, products, note: products.length ? undefined : "no_products_for_filters" };
}

export async function getProduct(id: string): Promise<ProductHit | null> {
  const r = await db().from("products").select(SELECT).eq("id", id).maybeSingle();
  if (r.error) throw new Error(`getProduct: ${r.error.message}`);
  return (r.data as unknown as ProductHit) ?? null;
}

/** Seasons the supplier has for a team (so the bot can say "we have 25/26 and 26/27"). */
export async function seasonsForTeam(teamId: string): Promise<string[]> {
  const rows = must(await db().from("products").select("season").eq("team_id", teamId).neq("status", "hidden").limit(1000), "seasons");
  return [...new Set((rows as { season: string | null }[]).map((r) => r.season).filter(Boolean) as string[])].sort().reverse();
}
