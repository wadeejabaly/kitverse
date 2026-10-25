/**
 * The shop's filter state lives entirely in the URL, so a filtered listing can
 * be linked, shared and re-entered from history. This builder is the single
 * place that shape is written — the rail, the team select and the empty state
 * all go through it, which is why a "clear" link and a filter link can never
 * disagree about the query format.
 */
export interface ShopFilters {
  kind?: string | null;
  league?: string | null;
  team?: string | null;
  season?: string | null;
}

export function shopHref(filters: ShopFilters): string {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.league) query.set("league", filters.league);
  if (filters.team) query.set("team", filters.team);
  if (filters.season) query.set("season", filters.season);
  const search = query.toString();
  return search ? `/shop?${search}` : "/shop";
}

/**
 * The same idea, scoped to one `/shop/[collection]` page (2026-10-25, the
 * owner's "filter each sub-category" ask). A collection already fixes
 * whichever dimension it names itself — a league page is that league, a team
 * page is that team — so its own filter rail only ever needs to carry the
 * dimensions the collection DOESN'T fix: team (skipped on a team collection
 * itself) and the product's own season/year. Keeping this separate from
 * `shopHref` rather than overloading it with a `basePath` means a collection
 * URL can never accidentally pick up a stray `kind`/`league` param that
 * `/shop` would otherwise read and misapply.
 */
export interface CollectionFilters {
  team?: string | null;
  season?: string | null;
}

export function collectionHref(slug: string, filters: CollectionFilters): string {
  const query = new URLSearchParams();
  if (filters.team) query.set("team", filters.team);
  if (filters.season) query.set("season", filters.season);
  const search = query.toString();
  return search ? `/shop/${slug}?${search}` : `/shop/${slug}`;
}

/** Read one search param as a single string, ignoring repeats. */
export function firstParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
