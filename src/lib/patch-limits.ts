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

/**
 * Champions League "full match version" (owner decision 2026-11-12): one generic option for every
 * club shirt - the supplier applies the badges that season actually wore (starball, titles badge,
 * sponsor patch - which pieces existed varies by season and nobody looks it up per shirt). It goes on
 * the shirt ALONE (nothing else can be combined with it) and is priced as a fixed number of patches
 * through the normal patch tiers: 3 on a retro shirt, 2 on a current one.
 */
export const FULL_VERSION_PATCH = "champions_league_full";

/** How many patches the full version is priced as. `retro` = the same retro signal the shirt's own price uses. */
export function fullVersionPieces(retro: boolean): number {
  return retro ? 3 : 2;
}

/** Patches to CHARGE for: every patch is 1, the full version is fullVersionPieces(). Client and server both price with this. */
export function patchPieces(patches: readonly string[], retro: boolean): number {
  return patches.reduce((n, p) => n + (p === FULL_VERSION_PATCH ? fullVersionPieces(retro) : 1), 0);
}

export function maxPatches(shirt: { type: "club" | "national" | null; leagueId: string | null; season: string | null | undefined }): number {
  if (shirt.type === "national") return 3;
  if (shirt.type !== "club") return 0;
  const season = normalizeSeason(shirt.season);
  if (shirt.leagueId && season && ONE_PATCH_SEASONS[shirt.leagueId]?.includes(season)) return 1;
  return 2;
}
