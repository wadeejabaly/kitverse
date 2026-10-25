/**
 * The shop's filter state lives entirely in the URL, so a filtered listing can
 * be linked, shared and re-entered from history. This builder is the single
 * place that shape is written — the rail, the team filter list and the empty
 * state all go through it, which is why a "clear" link and a filter checkbox
 * can never disagree about the query format.
 *
 * Checkboxes, not single-select (2026-10-25, the owner's "let the filters be
 * checkboxes" ask): every facet is multi-select — a product matches a group
 * once ANY of that group's checked values matches it (so checking Real Madrid
 * AND Barcelona shows both clubs), and still must match every group that has
 * at least one value checked (AND across groups — unchanged from before). A
 * group's values ride the URL as a repeated query param
 * (`?team=real-madrid&team=barcelona`), which next.js's own `searchParams`
 * already parses straight into a `string[]`.
 */
export interface ShopFilters {
  kind?: string[];
  league?: string[];
  team?: string[];
  season?: string[];
}

function appendAll(query: URLSearchParams, key: string, values: string[] | undefined) {
  for (const value of values ?? []) {
    if (value) query.append(key, value);
  }
}

export function shopHref(filters: ShopFilters): string {
  const query = new URLSearchParams();
  appendAll(query, "kind", filters.kind);
  appendAll(query, "league", filters.league);
  appendAll(query, "team", filters.team);
  appendAll(query, "season", filters.season);
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
  team?: string[];
  season?: string[];
}

export function collectionHref(slug: string, filters: CollectionFilters): string {
  const query = new URLSearchParams();
  appendAll(query, "team", filters.team);
  appendAll(query, "season", filters.season);
  const search = query.toString();
  return search ? `/shop/${slug}?${search}` : `/shop/${slug}`;
}

/**
 * Read one search param as every value it carries — zero, one, or (for a
 * checked-multiple group) several repeats of the same key — deduped and with
 * blanks dropped. Replaces the old `firstParam`, which only ever read the
 * first value: now that every facet is multi-select, every value matters.
 */
export function allParams(value: string | string[] | undefined): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return Array.from(new Set(raw.filter((entry) => entry.length > 0)));
}

/**
 * The array a checkbox's own href should carry: `value` removed if it's
 * already checked, appended if it isn't. Every checkbox in the rail is just a
 * link to `shopHref`/`collectionHref` built from this toggled array — there is
 * no client-side filter state anywhere in the shop.
 */
export function toggled(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}
