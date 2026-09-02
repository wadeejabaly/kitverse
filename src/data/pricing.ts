import type { Size, Version } from "./types";

/**
 * KitVerse pricing — single source of truth (owner-confirmed 2026-09-02).
 * The UI displays what this file computes; the server recomputes with it on
 * every write. A price sent by the client is NEVER trusted.
 *
 * Ladder (ILS, VAT-inclusive), flat by product type — the old current-season
 * vs previous-season split, and the compare-at that went with it, are gone:
 *   Fan                                 95
 *   Player                             110
 *   Retro (2022 and earlier, any cut)  135
 * Size 3XL adds +9, 4XL adds +12.
 *
 * "Retro" is not a version the shopper picks — it is what any jersey from
 * 2022 or earlier IS, whatever its fan/player cut. priceFor() derives that
 * from the product's `season`, NOT from the catalogue's `kind` field
 * (national/current/previous), which stays a browsing/display category and no
 * longer drives price at all.
 *
 * Add-ons are unchanged from the previous ladder: name & number 39, badge 19.
 */

export const SIZES: Size[] = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"];
export const VERSIONS: Version[] = ["fan", "player"];

const SIZE_SURCHARGE: Partial<Record<Size, number>> = { "3XL": 9, "4XL": 12 };

/** What this size adds to the base price. 0 for every size below 3XL. */
export function sizeSurcharge(size: Size): number {
  return SIZE_SURCHARGE[size] ?? 0;
}

/** A jersey from this year or earlier is Retro, whatever kind/version it was. */
export const RETRO_CUTOFF_YEAR = 2022;

/** The first four-digit year in a season string like "2026/27", "2022/23". */
export function seasonYear(season: string): number {
  const match = season.match(/\d{4}/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

/**
 * True for any product whose season is RETRO_CUTOFF_YEAR or earlier.
 *
 * An unparseable season reads as Infinity above and is therefore NOT retro —
 * deliberate: the retro price is the highest of the three, so a malformed
 * season falls back to the ordinary Fan/Player ladder rather than silently
 * charging a shopper 135 for a current shirt.
 */
export function isRetroSeason(season: string): boolean {
  return seasonYear(season) <= RETRO_CUTOFF_YEAR;
}

const FAN_PRICE = 95;
const PLAYER_PRICE = 110;
const RETRO_PRICE = 135;

/**
 * Product types the owner is adding to the catalogue with new photography.
 * The prices are confirmed; the products are not in `catalog.json` yet and
 * there is no selectable long-sleeve/kids/adult/NBA dimension, so NOTHING in
 * this file or the storefront reads these constants. They are parked here so
 * the figure lives in the one money file when the product data lands.
 */
export const FUTURE_PRICES = {
  fanLongSleeve: 105,
  playerLongSleeve: 120,
  retroLongSleeve: 145,
  kidsKit: 200,
  adultKit: 300,
  nbaVersion: 160,
} as const;

/**
 * Base price + size surcharge for a jersey identified by its season and the
 * shopper's fan/player choice. Retro seasons ignore `version` — there is one
 * Retro price, not a Retro-Fan and a Retro-Player.
 */
export function priceFor(season: string, size: Size, version: Version): number {
  const base = isRetroSeason(season)
    ? RETRO_PRICE
    : version === "player"
      ? PLAYER_PRICE
      : FAN_PRICE;
  return base + sizeSurcharge(size);
}

export const ADDONS = { nameNumber: 39, badge: 19 } as const;

/* ------------------------------------------------------------- delivery -- */

/**
 * Regional delivery, replacing the old single flat rate. The shopper picks
 * their region explicitly at checkout (CustomerSchema in src/lib/checkout.ts)
 * — it is never inferred from the free-text city field, which is far too
 * unreliable to bill shipping from.
 */
export type DeliveryRegion = "north" | "center" | "negev" | "jerusalem";

export const DELIVERY_REGIONS: DeliveryRegion[] = [
  "north",
  "center",
  "negev",
  "jerusalem",
];

/** "jerusalem" covers Jerusalem, the West Bank and Eilat — one tier, one label. */
export const SHIPPING_ILS_BY_REGION: Record<DeliveryRegion, number> = {
  north: 50,
  center: 60,
  negev: 70,
  jerusalem: 100,
};

export function shippingFor(region: DeliveryRegion): number {
  return SHIPPING_ILS_BY_REGION[region];
}

/** Membership test for anything arriving from outside — a form, a wire body. */
export function isDeliveryRegion(value: unknown): value is DeliveryRegion {
  return typeof value === "string" && (DELIVERY_REGIONS as string[]).includes(value);
}

/**
 * One cart line, already priced. `unitPrice` is `priceFor(...)` plus any
 * addons selected for that line (name & number, badge patch); `lineTotal` is
 * `unitPrice * qty`. Building a PricedLine from a raw CartItem + its Product
 * is the caller's job (the cart reads the product's `season` from the
 * catalog, calls `priceFor`, and adds ADDONS.* for whichever options the
 * line has selected) — pricing.ts only owns the money math, not cart state.
 */
export interface PricedLine {
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

/** Convenience builder for a PricedLine — pure, no catalog/cart coupling. */
export function priceLine(
  season: string,
  size: Size,
  version: Version,
  qty: number,
  addons: { nameNumber?: boolean; badge?: boolean } = {},
): PricedLine {
  const unitPrice =
    priceFor(season, size, version) +
    (addons.nameNumber ? ADDONS.nameNumber : 0) +
    (addons.badge ? ADDONS.badge : 0);
  return { unitPrice, qty, lineTotal: unitPrice * qty };
}

/**
 * Cart totals. `shipping` is supplied by the caller rather than read from a
 * constant, because there is no longer one rate to read: the cart page shows
 * "calculated by region at checkout" because it does not yet know the
 * shopper's region, and checkout computes `shippingFor(region)` once the
 * delivery form has one. Defaulting to 0 is what lets the cart page total a
 * basket honestly without inventing a rate.
 */
export function cartTotals(
  items: PricedLine[],
  shipping = 0,
): {
  subtotal: number;
  shipping: number;
  total: number;
} {
  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const appliedShipping = items.length > 0 ? shipping : 0;
  return { subtotal, shipping: appliedShipping, total: subtotal + appliedShipping };
}
