import type { Size, Version } from "./types";

/**
 * KitVerse pricing — single source of truth (owner-confirmed 2026-09-02).
 * The UI displays what this file computes; the server recomputes with it on
 * every write. A price sent by the client is NEVER trusted.
 *
 * Ladder (ILS, VAT-inclusive), flat by product type — no more current vs
 * previous-season split:
 *   Fan             95
 *   Player          110
 *   Retro (2022 and earlier, any cut) 135
 * Sizes 3XL adds +9, 4XL adds +12.
 *
 * "Retro" is not a version the shopper picks — it is what any jersey from
 * 2022 or earlier IS, regardless of fan/player cut, determined by the
 * product's season year. priceFor() below derives that from `season`, not
 * from the catalogue's `kind` field (national/current/previous), which stays
 * a browsing/display category and no longer drives price.
 *
 * Kids kit (200), Adult kit (300), NBA version (160), and long-sleeve
 * variants of Fan/Player/Retro (105/120/145) are additional product types
 * the owner is adding to the catalogue with new photos — these constants are
 * ready for them, but there is no selectable "long sleeve" dimension or
 * kids/adult/NBA product type in the catalogue yet, so nothing below wires
 * them into a live selector until that product data exists.
 */

export const SIZES: Size[] = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"];
export const VERSIONS: Version[] = ["fan", "player"];

const SIZE_SURCHARGE: Partial<Record<Size, number>> = { "3XL": 9, "4XL": 12 };

function sizeSurcharge(size: Size): number {
  return SIZE_SURCHARGE[size] ?? 0;
}

/** A jersey from this year or earlier is Retro, whatever kind/version it was. */
export const RETRO_CUTOFF_YEAR = 2022;

/** The first four-digit year in a season string like "2026/27", "2025", "2022/23". */
export function seasonYear(season: string): number {
  const match = season.match(/\d{4}/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

/** True for any product whose season is RETRO_CUTOFF_YEAR or earlier. */
export function isRetroSeason(season: string): boolean {
  return seasonYear(season) <= RETRO_CUTOFF_YEAR;
}

const FAN_PRICE = 95;
const PLAYER_PRICE = 110;
const RETRO_PRICE = 135;

/** Prices for product types not yet in the catalogue — see file header. */
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

export const ADDONS = { nameNumber: 20, badge: 12 } as const;

/* ------------------------------------------------------------- delivery -- */

/**
 * Regional delivery, replacing the old single flat rate. The shopper picks
 * their region explicitly at checkout (src/lib/checkout.ts's CustomerSchema)
 * — it is not inferred from the free-text city field, which is too unreliable
 * to price shipping from.
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

/**
 * Cash-on-delivery orders ask for a small Bit deposit up front, non-refundable
 * on a refused/cancelled delivery, deducted from what's paid to the courier.
 * Tiered by the order's value.
 */
export function bitDepositFor(orderValueIls: number): number {
  if (orderValueIls < 150) return 35;
  if (orderValueIls < 220) return 40;
  return 50;
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
 * Cart totals. `shipping` is supplied by the caller — the cart page shows
 * "calculated at checkout" because it does not yet know the shopper's
 * delivery region; checkout computes it with `shippingFor(region)` once the
 * delivery form has a region selected, and that is what is passed in here.
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
