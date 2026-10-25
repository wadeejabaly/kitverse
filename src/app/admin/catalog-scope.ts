/**
 * The agreed storefront scope (owner decision 2026-10-25, narrowed 2026-10-25): a hand-picked
 * list of clubs and national teams, not "every club in these leagues". 10 clubs per Big-5 league
 * (by fanbase) plus Al-Nassr and Alahli Saudi = 52 clubs, plus 46 national teams (every realistic
 * seller from the 2022/2026 World Cup pool, every Arab nation kept regardless) - all for the
 * current season only, nothing older. National shirts are kept whether the supplier labelled them
 * "2026/27" or plain "2026" (World Cup kits are usually listed by bare year, not a season range).
 *
 * Matching is by team id only (CATALOG_SCOPE.clubIds / nationalIds) - NOT by league_id or team
 * type - so a crawl-data mislabel (e.g. a club team mistakenly typed "national") can't hide a
 * product from this scope. Team ids are taken from catalog/teams.json (the crawl that originally
 * seeded the `teams` table); two are unconfirmed against the live database and may simply match
 * zero products, which is harmless - the /admin/catalog preview shows real counts before anything
 * is applied:
 *   - "juventus": catalog/README.md's own known-gaps list says this supplier has no current
 *     Juventus kit at all, so this is very likely a 0-match placeholder until stock is confirmed.
 *   - "as-monaco": present in the crawl with only 1 supplier album and mistakenly typed
 *     "national" (crawl bug, not a real nation) - may or may not have a real seedable product.
 *
 * This does not touch any product row that isn't in this list: a non-matching product already
 * featured is moved to "available" (bot can still sell it, just off the website) rather than
 * deleted - matches the catalog's own status model in catalog/README.md.
 *
 * Deliberately NOT in catalog-actions.ts: that file is "use server", and a "use server" file may
 * only export async functions - exporting this plain object broke the Vercel build
 * ("A 'use server' file can only export async functions, found object").
 */
export const CLUBS_BY_LEAGUE: Record<string, { label: string; ids: string[] }> = {
  "premier-league": {
    label: "Premier League",
    ids: ["arsenal", "aston-villa", "chelsea", "everton", "liverpool", "manchester-city", "manchester-united", "newcastle-united", "tottenham-hotspur", "west-ham-united"],
  },
  "la-liga": {
    label: "La Liga",
    ids: ["athletic-bilbao", "atletico-madrid", "barcelona", "celta-vigo", "real-betis", "real-madrid", "real-sociedad", "sevilla", "valencia", "villarreal"],
  },
  "serie-a": {
    label: "Serie A",
    ids: ["ac-milan", "roma", "atalanta", "bologna", "fiorentina", "inter-milan", "juventus", "lazio", "napoli", "torino"],
  },
  "bundesliga": {
    label: "Bundesliga",
    ids: ["leverkusen", "bayern-munich", "borussia-dortmund", "borussia-monchengladbach", "eintracht-frankfurt", "hamburger-sv", "rb-leipzig", "schalke", "vfb-stuttgart", "werder-bremen"],
  },
  "ligue-1": {
    label: "Ligue 1",
    ids: ["as-monaco", "lens", "lille", "nantes", "nice", "lyon", "marseille", "paris-saint-germain", "rennes", "saint-etienne"],
  },
};

export const EXTRA_CLUBS: { label: string; ids: string[] } = {
  label: "Extra clubs",
  ids: ["al-nassr", "alahli-saudi"],
};

export const NATIONAL_IDS = [
  "algeria", "argentina", "australia", "austria", "belgium", "brazil", "cameroon", "canada",
  "colombia", "costa-rica", "croatia", "czech-republic", "denmark", "ecuador", "egypt", "england",
  "france", "germany", "ghana", "iran", "iraq", "ivory-coast", "japan", "jordan", "mexico",
  "morocco", "netherlands", "norway", "paraguay", "poland", "portugal", "qatar", "saudi-arabia",
  "scotland", "senegal", "serbia", "south-africa", "south-korea", "spain", "sweden", "switzerland",
  "tunisia", "turkey", "united-states", "uruguay", "wales",
] as const;

export const CATALOG_SCOPE = {
  clubIds: [
    ...Object.values(CLUBS_BY_LEAGUE).flatMap((l) => l.ids),
    ...EXTRA_CLUBS.ids,
  ],
  nationalIds: [...NATIONAL_IDS],
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
