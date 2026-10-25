"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";

/**
 * The agreed storefront scope (owner decision 2026-10-25): the Big 5 league clubs, Al-Nassr and
 * Alahli Saudi, and every national team - all for the current season only, nothing older.
 * National shirts are kept whether the supplier labelled them "2026/27" or plain "2026" (World Cup
 * kits are usually listed by bare year, not a season range).
 *
 * This does not touch any product row that isn't a club in these leagues/extras or a national team:
 * a non-matching product already featured is moved to "available" (bot can still sell it, just off
 * the website) rather than deleted - matches the catalog's own status model in catalog/README.md.
 */
export const CATALOG_SCOPE = {
  leagueIds: ["premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"],
  extraClubIds: ["al-nassr", "alahli-saudi"],
  clubSeason: "2026/27",
  nationalSeasons: ["2026/27", "2026"],
} as const;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function scopeTeamIds(): Promise<{ clubIds: string[]; nationalIds: string[] }> {
  const teams = must(await db().from("teams").select("id,type,league_id"), "teams") as
    { id: string; type: string; league_id: string | null }[];
  const leagueIds: readonly string[] = CATALOG_SCOPE.leagueIds;
  const extraClubIds: readonly string[] = CATALOG_SCOPE.extraClubIds;
  const clubIds = teams
    .filter((t) => t.type === "club" && (leagueIds.includes(t.league_id ?? "") || extraClubIds.includes(t.id)))
    .map((t) => t.id);
  const nationalIds = teams.filter((t) => t.type === "national").map((t) => t.id);
  return { clubIds, nationalIds };
}

async function matchingProductIds(): Promise<string[]> {
  const { clubIds, nationalIds } = await scopeTeamIds();
  const out: string[] = [];
  for (const ids of chunk(clubIds, 150)) {
    if (!ids.length) continue;
    const rows = must(await db().from("products").select("id").eq("era", "current").eq("season", CATALOG_SCOPE.clubSeason).in("team_id", ids), "club products") as { id: string }[];
    out.push(...rows.map((r) => r.id));
  }
  for (const ids of chunk(nationalIds, 150)) {
    if (!ids.length) continue;
    const rows = must(await db().from("products").select("id").eq("era", "current").in("season", [...CATALOG_SCOPE.nationalSeasons]).in("team_id", ids), "national products") as { id: string }[];
    out.push(...rows.map((r) => r.id));
  }
  return [...new Set(out)];
}

export interface CatalogScopePreview {
  matchingTotal: number;
  currentlyFeaturedTotal: number;
  /** Matching products that will newly become featured. */
  toFeature: number;
  /** Currently-featured products outside the scope that will move to "available". */
  toUnfeature: number;
  /** Matching products that are already featured - no change. */
  staysFeatured: number;
}

export async function previewCatalogScope(): Promise<CatalogScopePreview> {
  await requireStaff();
  const matching = await matchingProductIds();
  const featuredRows = must(await db().from("products").select("id").eq("status", "featured"), "featured products") as { id: string }[];
  const featuredSet = new Set(featuredRows.map((r) => r.id));
  const matchSet = new Set(matching);
  return {
    matchingTotal: matching.length,
    currentlyFeaturedTotal: featuredSet.size,
    toFeature: matching.filter((id) => !featuredSet.has(id)).length,
    toUnfeature: featuredRows.filter((r) => !matchSet.has(r.id)).length,
    staysFeatured: matching.filter((id) => featuredSet.has(id)).length,
  };
}

/** Owner clicks "Apply" in /admin/catalog. Idempotent - safe to run again after a catalog refresh. */
export async function applyCatalogScope() {
  const staff = await requireStaff();
  const matching = await matchingProductIds();
  const featuredRows = must(await db().from("products").select("id").eq("status", "featured"), "featured products") as { id: string }[];
  const featuredSet = new Set(featuredRows.map((r) => r.id));
  const matchSet = new Set(matching);
  const toFeature = matching.filter((id) => !featuredSet.has(id));
  const toUnfeature = featuredRows.map((r) => r.id).filter((id) => !matchSet.has(id));

  for (const ids of chunk(toFeature, 150)) must(await db().from("products").update({ status: "featured" }).in("id", ids).select("id"), "feature products");
  for (const ids of chunk(toUnfeature, 150)) must(await db().from("products").update({ status: "available" }).in("id", ids).select("id"), "unfeature products");

  await db().from("audit_log").insert({
    actor: staff.id, action: "catalog.apply_scope", entity: "products",
    after: { featured: toFeature.length, unfeatured: toUnfeature.length, scope: CATALOG_SCOPE },
  });
  revalidatePath("/admin/catalog");
}
