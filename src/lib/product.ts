import type { Product } from "@/data/types";
import { PATCHES, type PatchId } from "@/lib/orders/rules";

/**
 * Locale-aware reads of a Product's bilingual fields, plus the small display
 * helpers the storefront reuses. Kept out of components so a card, a PDP and
 * a cart line can never disagree about how a title or a season renders.
 */

/** Product title in the reader's language. */
export function titleFor(product: Product, locale: string): string {
  return locale === "ar" ? product.titleAr : product.title;
}

/** Team name in the reader's language. */
export function teamFor(product: Product, locale: string): string {
  return locale === "ar" ? product.teamAr : product.team;
}

/**
 * Whether a photo path is a real, checked product photo rather than the
 * "no confirmed photo yet" placeholder (`export-store-catalog.ts` falls back
 * to `/products/_placeholder.jpg` for any product with no approved photo).
 * Owner decision 2026-10-26: until a real photo exists, the storefront shows
 * "Out of stock" instead of that placeholder image, everywhere a product's
 * photo is shown to a shopper (the card grid, the product page).
 */
export function hasPhoto(image: string): boolean {
  return !image.includes("_placeholder");
}

/**
 * The short season label used in card meta rows: "2025/26" → "25/26". A
 * single-year national season ("2026") is left whole. Always rendered inside
 * a bidi-isolated, LTR span — see <Season/>.
 */
export function shortSeason(season: string): string {
  const match = /^(\d{2})(\d{2})\/(\d{2})$/.exec(season);
  return match ? `${match[2]}/${match[3]}` : season;
}

/**
 * The name & number a customer may print on a shirt: uppercase Latin letters,
 * digits and single spaces, 18 characters max. Used by the PDP input as it
 * types and again wherever a stored cart item is trusted.
 */
export const NAME_NUMBER_MAX = 18;

export function sanitizeNameNumber(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, NAME_NUMBER_MAX);
}

/**
 * The official-patch add-on (owner decisions 2026-10-23, 2026-10-25 and
 * 2026-10-26) is re-checked against the PRODUCT, not trusted from the
 * client: built on the exact same `PATCHES` table and per-team-type cap
 * (club 2, national 3) that `checkPatches()` in lib/orders/rules.ts already
 * enforces for the Instagram bot, so the website and the bot can never
 * disagree about what a shirt may carry. Unlike `checkPatches` — which
 * REJECTS an invalid combination outright so the bot can ask the owner —
 * this SANITIZES: anything invalid (wrong team type, wrong league, a
 * duplicate, or past the cap) is silently dropped rather than failing the
 * whole order, the same defence `sanitizeNameNumber` above applies to the
 * other add-on. This is the server-side mirror of what
 * src/data/patches.ts's `patchOptionsFor()` already limits the UI to.
 */
export function sanitizePatches(patches: PatchId[], product: Product): PatchId[] {
  const team =
    product.league !== null
      ? { type: "club" as const, league_id: product.league }
      : product.kind === "national"
        ? { type: "national" as const, league_id: null as string | null }
        : null;
  if (!team) return [];
  const max = team.type === "national" ? 3 : 2;
  const seen = new Set<PatchId>();
  const valid: PatchId[] = [];
  for (const p of patches) {
    if (valid.length >= max || seen.has(p)) continue;
    const rule: (typeof PATCHES)[PatchId] | undefined = PATCHES[p];
    if (!rule) continue;
    if (team.type === "club" && !rule.clubs) continue;
    if (team.type === "national" && !rule.nations) continue;
    if (p === "league" && !team.league_id) continue;
    if ("leagues" in rule && rule.leagues && !(rule.leagues as readonly string[]).includes(team.league_id ?? "")) continue;
    seen.add(p);
    valid.push(p);
  }
  return valid;
}
