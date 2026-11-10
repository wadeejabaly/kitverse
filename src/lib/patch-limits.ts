import { normalizeSeason } from "./text";

/**
 * How many official patches a shirt can carry - the ONE rule the storefront
 * picker (src/data/patches.ts), the website order check (sanitizePatches in
 * src/lib/product.ts), the Instagram bot (checkPatches in
 * src/lib/orders/rules.ts) and admin inventory all share.
 *
 *  - national-team shirt: up to 3 (World Cup + Peace + Champions badges)
 *  - club shirt: up to 2 (one per sleeve)
 *  - EXCEPT La Liga 2025/26 and 2026/27 shirts: only 1 (owner decision
 *    2026-11-10, "in the Spanish league only 1 patch at a time" - applied to
 *    2025/26 as asked and to the 2026/27 shirts the website sells; older and
 *    retro La Liga shirts keep 2).
 */
export const ONE_PATCH_SEASONS: Record<string, readonly string[]> = {
  "la-liga": ["2025/26", "2026/27"],
};

export function maxPatches(shirt: { type: "club" | "national" | null; leagueId: string | null; season: string | null | undefined }): number {
  if (shirt.type === "national") return 3;
  if (shirt.type !== "club") return 0;
  const season = normalizeSeason(shirt.season);
  if (shirt.leagueId && season && ONE_PATCH_SEASONS[shirt.leagueId]?.includes(season)) return 1;
  return 2;
}
