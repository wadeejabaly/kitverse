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

/**
 * Chest extras (owner request 2026-11-12, Real Madrid 2016/17 away "plus all these possible patches"):
 * the gold FIFA Club World Champions badge and a Champions League final match print sit on the CHEST,
 * not a sleeve - so they don't count toward the sleeve cap below and they DO combine with the
 * Champions League full version (whose "alone" rule is about the sleeves). Each is priced as 1 patch.
 * Which shirts may carry them: src/lib/patch-eligibility.ts.
 */
export const CHEST_PATCHES: readonly string[] = ["club_world_cup", "ucl_final_print", "ucl_respect"];
// (ucl_respect is not on the chest - it sits UNDER the titles badge on the same sleeve - but likewise
// doesn't take a sleeve slot of its own, so it lives in this list too.)

/** The patches that take a sleeve (everything but the chest extras) - what the cap and the "alone" rule count. */
export function sleevePatches<T extends string>(patches: readonly T[]): T[] {
  return patches.filter((p) => !CHEST_PATCHES.includes(p));
}

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

/**
 * Tapping a patch in a picker (the product page and the bundle page share this): unpicks it, or picks it
 * within the cap - chest extras just add; the legacy full version, or a one-patch shirt, swaps the
 * sleeve patches; a full shirt ignores the tap.
 */
export function togglePatchIn<T extends string>(current: readonly T[], id: T, max: number): T[] {
  if (current.includes(id)) return current.filter((p) => p !== id);
  if (CHEST_PATCHES.includes(id)) return [...current, id];
  const chest = current.filter((p) => CHEST_PATCHES.includes(p));
  const sleeves = sleevePatches(current);
  if (id === FULL_VERSION_PATCH || sleeves.includes(FULL_VERSION_PATCH as T)) return [id, ...chest];
  if (max === 1) return [id, ...chest];
  if (sleeves.length >= max) return [...current];
  return [...current, id];
}
