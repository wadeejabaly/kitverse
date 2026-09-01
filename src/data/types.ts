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
  image: string; // "/products/<handle>.jpg"
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
