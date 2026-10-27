/**
 * Background-removed versions of the hero's named shirts (owner reference
 * 2026-10-27, "like this" — a floating cutout on the stage rather than a
 * white studio tile). Generated once from the product's own approved photo
 * via a border-connected flood fill (so an all-white shirt body is never
 * mistaken for the white studio background the way a flat colour threshold
 * would), not an AI render — see public/hero/ for the files.
 *
 * Keyed by handle rather than hardcoded into HeroD.tsx: pickShirts() in
 * shirts.ts falls back to whatever is actually visible if a named handle
 * vanishes from the catalog, and that fallback shirt will not have a cutout
 * made for it. HeroD looks a product up here and falls back to its normal
 * `image` (the white tile treatment the rest of the site already uses) when
 * there is no entry — so a catalog change can never produce a broken image,
 * only a less art-directed one.
 */
export const HERO_CUTOUTS: Record<string, string> = {
  "arsenal-2026-27-home-shirt": "/hero/arsenal-2026-27-home-shirt-cutout.png",
  "real-madrid-2026-27-home-shirt": "/hero/real-madrid-2026-27-home-shirt-cutout.png",
  "ac-milan-2026-27-home-shirt": "/hero/ac-milan-2026-27-home-shirt-cutout.png",
};
