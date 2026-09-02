import catalogData from "./catalog.json";
import collectionsData from "./collections.json";
import { slugify } from "./slug";
import type { Kind, Product } from "./types";

/**
 * Typed catalog accessors — the only way the storefront (wave 3) and the
 * review tool should touch catalog.json/collections.json. Both files are
 * static, build-time JSON written by scripts/import-catalog.mjs.
 */

export interface League {
  slug: string;
  name: string;
  nameAr: string;
}

export interface Team {
  slug: string;
  name: string;
  nameAr: string;
  kind: "national" | "club";
}

export interface SearchEntry {
  handle: string;
  title: string;
  titleAr: string;
  team: string;
  teamAr: string;
}

const products: Product[] = catalogData.products as Product[];
const leagues: League[] = collectionsData.leagues as League[];
const teams: Team[] = collectionsData.teams as Team[];

const productsByHandle = new Map<string, Product>(products.map((p) => [p.handle, p]));

/** Every product whose review state is approved — the only set the storefront renders. */
export function getVisibleProducts(): Product[] {
  return products.filter((p) => p.visible);
}

/**
 * A single product by handle, visible or not. Callers that render a PDP must
 * check `visible` themselves and call `notFound()` at the page level when
 * it's false — this accessor does not filter, so the review tool can also
 * use it.
 */
export function getProduct(handle: string): Product | undefined {
  return productsByHandle.get(handle);
}

/** Visible products in a given football league (club products only). */
export function byLeague(slug: string): Product[] {
  return getVisibleProducts().filter((p) => p.league === slug);
}

/** Visible products for a given team, matched by slugifying `product.team`. */
export function byTeam(slug: string): Product[] {
  return getVisibleProducts().filter((p) => slugify(p.team) === slug);
}

/** Visible products of a given kind (national | current | previous). */
export function byKind(kind: Kind): Product[] {
  return getVisibleProducts().filter((p) => p.kind === kind);
}

/** Lightweight index for client-side search — visible products only. */
export function searchIndex(): SearchEntry[] {
  return getVisibleProducts().map(({ handle, title, titleAr, team, teamAr }) => ({
    handle,
    title,
    titleAr,
    team,
    teamAr,
  }));
}

/** All leagues (collections.json is already filtered to leagues with ≥1 product). */
export function getLeagues(): League[] {
  return leagues;
}

/** All teams (national + club) present in the catalog, regardless of visibility. */
export function getTeams(): Team[] {
  return teams;
}

/** Every product, visible or not — used by the review tool's contact sheet/grid. */
export function getAllProducts(): Product[] {
  return products;
}
