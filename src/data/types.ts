/**
 * KitVerse catalog data contracts. This file is the single source of truth
 * for the shape of a product and a cart item — the import script
 * (scripts/import-catalog.mjs) writes catalog.json/collections.json to this
 * shape, and every accessor/consumer in src/data/catalog.ts, the storefront
 * (wave 3), and pricing.ts imports these types rather than redeclaring them.
 */

import type { PatchId } from "@/lib/orders/rules";
export type { PatchId };

export type Kind = "national" | "current" | "previous";
export type Kit = "Home" | "Away" | "Third";
export type Size = "S" | "M" | "L" | "XL" | "XXL" | "3XL" | "4XL";
export type Version = "fan" | "player";

/**
 * The official-patch add-on (owner decision 2026-10-23, replacing the single
 * generic "badge" boolean; extended 2026-10-25 with a World Cup patch for
 * national-team shirts; extended again 2026-10-26 into a MULTI-select,
 * TIERED-price picker with real patch artwork). A shopper now picks a SET of
 * patches per shirt, `PatchId[]` (imported from the order/DB layer's own
 * vocabulary in lib/orders/rules.ts — the single source of truth for which
 * ids exist and which team types each is for):
 *
 *   - a CLUB product (`Product.league !== null`) can carry up to 2 patches
 *     (one per sleeve): its own league's patch (only for leagues we have
 *     artwork for — see src/data/patches.ts), the Champions League patch
 *     (with per-club trophy-count artwork), the Europa League patch, and —
 *     Serie A clubs only — the Coppa Italia patch;
 *   - a NATIONAL-TEAM product (`Product.kind === "national"`,
 *     `Product.league === null`) can carry up to 3: the World Cup, Peace and
 *     Champions badges, any or all of them at once.
 *
 * Each patch is priced on a tier by COUNT, not by which ones are picked: the
 * 1st costs price_tiers[0] (₪12.99), the 2nd price_tiers[1] (₪9.99), the 3rd
 * price_tiers[2] (₪6.99) — see Addon.price_tiers in lib/pricing/schema.ts and
 * tieredTotal() in lib/pricing/tiers.ts.
 *
 * src/data/patches.ts's patchOptionsFor() is the single place that decides
 * which options (with which photo) a product offers; sanitizePatches() in
 * lib/product.ts is its server-side mirror, built on the same PATCHES/
 * checkPatches rules the Instagram bot already uses, so the two can never
 * drift apart silently.
 */

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

export interface JerseyCartItem {
  kind: "jersey";
  handle: string;
  size: Size;
  version: Version;
  nameNumber?: string; // <=18 chars, trimmed, uppercase-latin+digits+space allowed
  /** Zero or more patches, cheapest-tier-first order not required — price is by count, not identity. */
  patches: PatchId[];
  qty: number; // 1..10
}

/**
 * An accessory line (2026-10-25, the "add an Accessories category, keychains
 * for now" ask). Deliberately much thinner than a jersey line: no size,
 * version or patch — an accessory has one flat price and nothing to
 * configure, so the only choice is how many.
 */
export interface AccessoryCartItem {
  kind: "accessory";
  handle: string;
  qty: number; // 1..10
}

/**
 * `kind` is the discriminant added when the cart grew a second kind of line.
 * A cart saved by an earlier release has neither tag at all — CartProvider's
 * `parseStoredCart` treats anything without `kind` as a jersey line, the only
 * kind that could have been stored before this.
 */
export type CartItem = JerseyCartItem | AccessoryCartItem;

export type AccessoryCategory = "keychain";

/**
 * A non-jersey product (2026-10-25). Intentionally a separate, much simpler
 * shape from `Product`: no kit/season/league/edition, because none of those
 * jersey concepts apply — one flat price, one photo, done. Lives in its own
 * hand-maintained src/data/accessories.json rather than catalog.json, which
 * scripts/export-store-catalog.ts regenerates from the database on every
 * build and would silently wipe anything added here by hand.
 */
export interface Accessory {
  handle: string; // normalized, ASCII, unique — e.g. "keychain-real-madrid"
  category: AccessoryCategory;
  team: string; // EN
  teamAr: string;
  price: number; // ILS, flat — e.g. 14.99. No size/version pricing.
  image: string;
  visible: boolean;
}
