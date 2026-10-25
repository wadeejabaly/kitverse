import type { Patch, Product } from "@/data/types";

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
 * The official-patch add-on (owner decisions 2026-10-23 and 2026-10-25) is
 * re-checked against the PRODUCT, not trusted from the client: a club shirt
 * can only ever carry "league" or "ucl", a national-team shirt can only ever
 * carry "worldcup", and the two sets never overlap. Whatever the client
 * sent, anything outside the product's own set collapses to "none" here —
 * the same defence sanitizeNameNumber above applies to the other add-on, and
 * the server-side half of what ProductForm's patchOptionsFor() already
 * enforces in the UI.
 */
export function sanitizePatch(patch: Patch, product: Product): Patch {
  if (product.league !== null) {
    return patch === "league" || patch === "ucl" ? patch : "none";
  }
  if (product.kind === "national") {
    return patch === "worldcup" ? patch : "none";
  }
  return "none";
}
