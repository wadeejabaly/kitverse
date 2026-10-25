/**
 * The agreed storefront scope (owner decision 2026-10-25): the Big 5 league clubs, Al-Nassr and
 * Alahli Saudi, and every national team - all for the current season only, nothing older.
 * National shirts are kept whether the supplier labelled them "2026/27" or plain "2026" (World Cup
 * kits are usually listed by bare year, not a season range).
 *
 * This does not touch any product row that isn't a club in these leagues/extras or a national team:
 * a non-matching product already featured is moved to "available" (bot can still sell it, just off
 * the website) rather than deleted - matches the catalog's own status model in catalog/README.md.
 *
 * Deliberately NOT in catalog-actions.ts: that file is "use server", and a "use server" file may
 * only export async functions - exporting this plain object broke the Vercel build
 * ("A 'use server' file can only export async functions, found object").
 */
export const CATALOG_SCOPE = {
  leagueIds: ["premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"],
  extraClubIds: ["al-nassr", "alahli-saudi"],
  clubSeason: "2026/27",
  nationalSeasons: ["2026/27", "2026"],
} as const;

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
