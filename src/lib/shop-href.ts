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
}

export function shopHref(filters: ShopFilters): string {
  const query = new URLSearchParams();
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.league) query.set("league", filters.league);
  if (filters.team) query.set("team", filters.team);
  const search = query.toString();
  return search ? `/shop?${search}` : "/shop";
}

/** Read one search param as a single string, ignoring repeats. */
export function firstParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
