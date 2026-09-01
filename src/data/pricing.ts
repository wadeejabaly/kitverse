import type { Kind, Size, Version } from "./types";

/**
 * KitVerse pricing — single source of truth (owner-confirmed 2026-09-01).
 * The UI displays what this file computes; the server recomputes with it on
 * every write. A price sent by the client is NEVER trusted.
 *
 * Ladder (ILS, VAT-inclusive):
 *   current-season + national → Fan 169 / Player 219
 *   previous-season           → Fan 129 / Player 169 (compare-at 169 / 219)
 *   Sizes 3XL & 4XL add +15 (also reflected in the compare-at figure, since
 *   compare-at represents "what this size would cost at current-season
 *   pricing" — the surcharge is a per-size cost, not a per-season one).
 */

export const SIZES: Size[] = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"];
export const VERSIONS: Version[] = ["fan", "player"];

const SIZE_SURCHARGE_SIZES = new Set<Size>(["3XL", "4XL"]);
const SIZE_SURCHARGE = 15;

function basePrice(kind: Kind, version: Version): number {
  const isPrevious = kind === "previous";
  if (version === "fan") return isPrevious ? 129 : 169;
  return isPrevious ? 169 : 219;
}

function compareBasePrice(version: Version): number {
  // The "current-season equivalent" price a previous-season item is marked
  // down from — i.e. today's base price for that version.
  return version === "fan" ? 169 : 219;
}

function sizeSurcharge(size: Size): number {
  return SIZE_SURCHARGE_SIZES.has(size) ? SIZE_SURCHARGE : 0;
}

/** Base price + size surcharge. */
export function priceFor(kind: Kind, size: Size, version: Version): number {
  return basePrice(kind, version) + sizeSurcharge(size);
}

/** Compare-at (strikethrough) price — previous-season products only. */
export function compareAtFor(
  kind: Kind,
  size: Size,
  version: Version,
): number | null {
  if (kind !== "previous") return null;
  return compareBasePrice(version) + sizeSurcharge(size);
}

export const ADDONS = { nameNumber: 39, badge: 19 } as const;

export const SHIPPING_ILS_DOMESTIC = 35; // PLACEHOLDER — client to confirm

/**
 * One cart line, already priced. `unitPrice` is `priceFor(...)` plus any
 * addons selected for that line (name & number, badge patch); `lineTotal` is
 * `unitPrice * qty`. Building a PricedLine from a raw CartItem + its Product
 * is the caller's job (wave 3's cart reads the product's `kind` from the
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
  kind: Kind,
  size: Size,
  version: Version,
  qty: number,
  addons: { nameNumber?: boolean; badge?: boolean } = {},
): PricedLine {
  const unitPrice =
    priceFor(kind, size, version) +
    (addons.nameNumber ? ADDONS.nameNumber : 0) +
    (addons.badge ? ADDONS.badge : 0);
  return { unitPrice, qty, lineTotal: unitPrice * qty };
}

/** Cart totals — shipping is the flat domestic rate, applied once per order. */
export function cartTotals(items: PricedLine[]): {
  subtotal: number;
  shipping: number;
  total: number;
} {
  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const shipping = items.length > 0 ? SHIPPING_ILS_DOMESTIC : 0;
  return { subtotal, shipping, total: subtotal + shipping };
}
