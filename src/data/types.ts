/**
 * KitVerse catalog data contracts. This file is the single source of truth
 * for the shape of a product and a cart item — the import script
 * (scripts/import-catalog.mjs) writes catalog.json/collections.json to this
 * shape, and every accessor/consumer in src/data/catalog.ts, the storefront
 * (wave 3), and pricing.ts imports these types rather than redeclaring them.
 */

export type Kind = "national" | "current" | "previous";
export type Kit = "Home" | "Away" | "Third";
export type Size = "S" | "M" | "L" | "XL" | "XXL" | "3XL" | "4XL";
export type Version = "fan" | "player";

export interface Product {
  handle: string; // normalized, ASCII, unique
  title: string; // EN
  titleAr: string;
  team: string; // EN
  teamAr: string;
  kind: Kind;
  season: string; // "2026/27" | "2026" | "2025/26"
  kit: Kit;
  league: string | null; // "premier-league" | "la-liga" | "serie-a" | "bundesliga" | "ligue-1" | null (national)
  edition: "standard" | "anniversary";
  image: string; // primary/front photo — "/products/<handle>.jpg"
  /**
   * Additional photos (back, detail shots, …) shown after `image` on the PDP
   * gallery. Optional and absent on almost every product today: the catalog
   * moved to hand-maintained JSON when it was rebuilt for 2026/27 (see
   * CLAUDE.md "Owner decisions" §1), so real photography — this field
   * included — is added by hand per product as it arrives, not produced by
   * scripts/import-catalog.mjs. That importer predates this field and
   * rewrites catalog.json's products array from scratch on every run, so
   * rerunning it against vendor/ source data would silently drop any
   * hand-added `images` — do not run it on a product that has one without
   * carrying the field forward by hand afterwards.
   */
  images?: string[];
  sourceHash: string; // supplier provenance
  visible: boolean; // approved review state AND not deduped-away
}

export interface CartItem {
  handle: string;
  size: Size;
  version: Version;
  nameNumber?: string; // <=18 chars, trimmed, uppercase-latin+digits+space allowed
  badge: boolean;
  qty: number; // 1..10
}
