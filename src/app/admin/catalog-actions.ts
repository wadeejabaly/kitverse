"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { CATALOG_SCOPE } from "./catalog-scope";
import type { CatalogScopePreview } from "./catalog-scope";

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Matches by team id only, against the explicit allowlist in catalog-scope.ts - never by
 * league_id or team type, since a crawl-data mislabel on either of those must not hide a product
 * from this scope (see catalog-scope.ts for the known data-quality caveats on two ids).
 */
async function matchingProductIds(): Promise<string[]> {
  const clubIds: string[] = [...CATALOG_SCOPE.clubIds];
  const nationalIds: string[] = [...CATALOG_SCOPE.nationalIds];
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
