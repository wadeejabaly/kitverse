import { byKind, byLeague, byTeam, getLeagues, getTeams } from "@/data/catalog";
import type { Kind, Product } from "@/data/types";

/**
 * `/shop/[collection]` resolves one flat slug space to three kinds of
 * collection: a season group, a league, or a team. Keeping the mapping here
 * means the route, the sitemap and the nav all agree on which slugs exist.
 *
 * Season slugs are written for readers, not for the data model — "new-season"
 * rather than "current" — and are the only place those two vocabularies meet.
 */
export const KIND_SLUGS = {
  "national-teams": "national",
  "new-season": "current",
  "last-season": "previous",
} as const satisfies Record<string, Kind>;

export type KindSlug = keyof typeof KIND_SLUGS;

export const SLUG_FOR_KIND: Record<Kind, KindSlug> = {
  national: "national-teams",
  current: "new-season",
  previous: "last-season",
};

export type Collection =
  | { type: "kind"; slug: KindSlug; kind: Kind; products: Product[] }
  | { type: "league"; slug: string; name: string; nameAr: string; products: Product[] }
  | { type: "team"; slug: string; name: string; nameAr: string; products: Product[] };

/**
 * Resolve a slug to a collection, or undefined if it names nothing.
 *
 * A valid-but-empty collection still resolves: a league whose products are all
 * awaiting image review is a real page that should render its own empty state,
 * not a 404. Only an unknown slug is a miss.
 */
export function resolveCollection(slug: string): Collection | undefined {
  if (slug in KIND_SLUGS) {
    const kindSlug = slug as KindSlug;
    const kind = KIND_SLUGS[kindSlug];
    return { type: "kind", slug: kindSlug, kind, products: byKind(kind) };
  }

  const league = getLeagues().find((candidate) => candidate.slug === slug);
  if (league) {
    return {
      type: "league",
      slug: league.slug,
      name: league.name,
      nameAr: league.nameAr,
      products: byLeague(league.slug),
    };
  }

  const team = getTeams().find((candidate) => candidate.slug === slug);
  if (team) {
    return {
      type: "team",
      slug: team.slug,
      name: team.name,
      nameAr: team.nameAr,
      products: byTeam(team.slug),
    };
  }

  return undefined;
}

/**
 * Slugs worth pre-rendering: the three season groups, every league, and every
 * team that currently has a visible product. Teams whose photos are still
 * being reviewed render on demand instead of shipping hundreds of empty pages.
 */
export function collectionParams(): string[] {
  const teamSlugs = new Set(
    getTeams()
      .filter((team) => byTeam(team.slug).length > 0)
      .map((team) => team.slug),
  );
  return [
    ...Object.keys(KIND_SLUGS),
    ...getLeagues().map((league) => league.slug),
    ...teamSlugs,
  ];
}
