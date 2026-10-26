import type { Size, Version } from "./types";
import priceList from "./price-list.json";
import { tieredTotal } from "@/lib/pricing/tiers";

/**
 * Every number below comes from the bot's price list (src/data/price-list.json, exported from the
 * database by scripts/export-store-catalog.ts), so the website and the Instagram bot always quote
 * the same prices. The server re-prices every order with src/lib/pricing/engine.ts.
 */
type PL = { groups: { id: string; price: number }[]; addons: { id: string; price: number; price_tiers?: number[] }[]; delivery: { zones: { id: string; fee: number; name_ar: string }[] } };
const pl = priceList as unknown as PL;
const groupPrice = (id: string) => pl.groups.find((g) => g.id === id)?.price ?? 0;
const addonPrice = (id: string) => pl.addons.find((a) => a.id === id)?.price ?? 0;
const addonTiers = (id: string) => pl.addons.find((a) => a.id === id)?.price_tiers;
const zoneFee = (id: string) => pl.delivery.zones.find((z) => z.id === id)?.fee ?? 0;
const zoneLabel = (id: string) => pl.delivery.zones.find((z) => z.id === id)?.name_ar ?? "";

/**
 * KitVerse pricing — single source of truth (owner-confirmed 2026-09-02).
 * The UI displays what this file computes; the server recomputes with it on
 * every write. A price sent by the client is NEVER trusted.
 *
 * Ladder (ILS, VAT-inclusive), flat by product type — the old current-season
 * vs previous-season split, and the compare-at that went with it, are gone:
 *   Fan                                 95
 *   Player                             110
 *   Retro (2023 and earlier, any cut)  135
 * Size 3XL adds +9, 4XL adds +12.
 *
 * "Retro" is not a version the shopper picks — it is what any jersey from
 * 2023 or earlier IS, whatever its fan/player cut. priceFor() derives that
 * from the product's `season`, NOT from the catalogue's `kind` field
 * (national/current/previous), which stays a browsing/display category and no
 * longer drives price at all.
 *
 * Add-ons dropped with the same owner decision: name & number 20 (was 39),
 * badge patch 12 (was 19). The badge patch itself was later replaced by the
 * official-patch choice (owner decision 2026-10-23) at ₪11.99 — this file's
 * first fractional price, see round2() below.
 */

export const SIZES: Size[] = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"];
export const VERSIONS: Version[] = ["fan", "player"];

const SIZE_SURCHARGE: Partial<Record<Size, number>> = { "3XL": addonPrice("size_3xl"), "4XL": addonPrice("size_4xl") };

/** What this size adds to the base price. 0 for every size below 3XL. */
export function sizeSurcharge(size: Size): number {
  return SIZE_SURCHARGE[size] ?? 0;
}

/** A jersey from this year or earlier is Retro, whatever kind/version it was.
 *  Owner correction 2026-10-22: cutoff moved from 2022 to 2023 — 2024 and
 *  newer seasons are always Fan/Player, never Retro. */
export const RETRO_CUTOFF_YEAR = 2023;

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

const FAN_PRICE = groupPrice("fan");
const PLAYER_PRICE = groupPrice("player");
const RETRO_PRICE = groupPrice("retro");

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

/**
 * Round to the nearest cent. Every ILS figure this file produces by adding or
 * multiplying money passes through this — not because the ladder itself has
 * fractions (it doesn't: Fan/Player/Retro and the surcharges are all whole
 * shekels), but because two add-ons now are NOT whole shekels (ADDONS.patch
 * and GIFT_BOX_PRICE, both ₪x.99), and floating-point multiplication of a
 * value like 11.99 drifts (11.99 * 3 is not exactly 35.97 in IEEE 754).
 * Rounding after every sum/product keeps every displayed and charged figure
 * exact to the cent instead of accumulating drift across a multi-line cart.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Add-ons (owner decisions 2026-09-02, 2026-10-23 and 2026-10-26). `patch`
 * is now TIERED by how many patches are on the same shirt, not a flat price
 * per patch: `ADDONS.patch` stays the single-patch figure (what the 1st one
 * costs) for anything that only needs one number, and `ADDONS.patchTiers`
 * carries the full ladder — 1st/2nd/3rd — for `patchesTotal()` below. Every
 * patch id costs the same regardless of WHICH one it is; only the COUNT on
 * the shirt changes the price.
 */
export const ADDONS = { nameNumber: addonPrice("name_number"), patch: addonPrice("patch") } as const;

const PATCH_TIERS = addonTiers("patch");

/** What `count` patches on one shirt cost in total (tier 1 + tier 2 + …), rounded to the cent. */
export function patchesTotal(count: number): number {
  return round2(tieredTotal(PATCH_TIERS, ADDONS.patch, count));
}

/** What the Nth patch (1-based) on one shirt adds - for the "1st / 2nd / 3rd" hint. */
export const patchPrice = (n: number) => round2(patchesTotal(n) - patchesTotal(n - 1));

/* ------------------------------------------------------------- delivery -- */

/**
 * Owner decision 2026-10-25: the shopper never picks a region — they just type
 * their city (CustomerSchema.city in src/lib/checkout.ts), and the server
 * matches it against the same town → zone list the Instagram bot already uses
 * (src/lib/localities.ts, backed by the `localities` table) to work out the
 * fee. Two tiers only: "north" (through Kfar Qara) and "rest" (everywhere
 * else, the West Bank included) — shown separately so a northern customer
 * never thinks everyone pays the higher fee.
 *
 * This file only has the two FIGURES, for display before the city is known
 * (the checkout summary, the /shipping page). The actual city → tier lookup
 * needs the database and happens server-side — see /api/checkout/resolve-city
 * and resolveTown() in src/lib/localities.ts.
 */
export type ShippingTier = "north" | "rest";

export const SHIPPING_ILS_BY_TIER: Record<ShippingTier, number> = {
  north: zoneFee("north"),
  // center/negev/jerusalem/jer_ws_eilat are now priced identically — any one of them reads the shared "rest" fee.
  rest: zoneFee("center"),
};

/** The zone's own Arabic label (e.g. "الشمال (لحد كفر قرع)" / "باقي المناطق") — matches exactly
 *  what POST /api/checkout/resolve-city returns as `label` for a server-resolved town, so the
 *  CityCombobox's instant local pick (src/components/checkout/CityCombobox.tsx) shows the same
 *  text as a server round trip would, no round trip needed. */
export const SHIPPING_LABEL_BY_TIER: Record<ShippingTier, string> = {
  north: zoneLabel("north"),
  rest: zoneLabel("center"),
};

/**
 * One cart line, already priced. `unitPrice` is `priceFor(...)` plus any
 * addons selected for that line (name & number, official patch); `lineTotal`
 * is `unitPrice * qty`. Building a PricedLine from a raw CartItem + its
 * Product is the caller's job (the cart reads the product's `season` from the
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
  addons: { nameNumber?: boolean; patchCount?: number } = {},
): PricedLine {
  const unitPrice = round2(
    priceFor(season, size, version) +
      (addons.nameNumber ? ADDONS.nameNumber : 0) +
      patchesTotal(addons.patchCount ?? 0),
  );
  return { unitPrice, qty, lineTotal: round2(unitPrice * qty) };
}

/**
 * Cart totals. `shipping` is supplied by the caller rather than read from a
 * constant, because there is no longer one rate to read: the cart page shows
 * "calculated once we know your city" because it does not yet know the
 * shopper's city, and checkout resolves it (POST /api/checkout/resolve-city)
 * once they've typed one. Defaulting to 0 is what lets the cart page total a
 * basket honestly without inventing a rate.
 *
 * `giftBoxQty` (owner decision 2026-10-23) is the CHECKOUT-only gift-box
 * add-on — it does not exist on the cart page, only at checkout, which is why
 * it defaults to 0 and every pre-checkout call site is unaffected. It is a
 * per-ORDER quantity, not a per-shirt line: one box can hold more than one
 * shirt, so the shopper picks how many boxes they want, not whether each
 * shirt gets one.
 */
export function cartTotals(
  items: PricedLine[],
  shipping = 0,
  giftBoxQty = 0,
): {
  subtotal: number;
  shipping: number;
  giftBox: number;
  total: number;
} {
  const subtotal = round2(items.reduce((sum, line) => sum + line.lineTotal, 0));
  const appliedShipping = items.length > 0 ? shipping : 0;
  const giftBox = items.length > 0 ? giftBoxTotalFor(giftBoxQty) : 0;
  return {
    subtotal,
    shipping: appliedShipping,
    giftBox,
    total: round2(subtotal + appliedShipping + giftBox),
  };
}

/* ------------------------------------------------------------ gift box -- */

/**
 * The gift-box add-on (owner decision 2026-10-23): a box for the shirts in
 * the order, offered at checkout only. It is priced PER ORDER, not per shirt
 * — "one per order, but they can get as many as they like, the box fits more
 * than 1 shirt" — so the shopper picks a quantity of boxes (0 = none), and
 * each box is ₪34.99 exactly: the owner's explicit choice, overriding this
 * file's usual whole-shekel convention and the first fractional price on the
 * site (the official patch, ADDONS.patch, followed the same decision).
 */
export const GIFT_BOX_PRICE = addonPrice("gift_box");

/** A generous but finite ceiling — mirrors the per-line MAX_QTY (10). */
export const GIFT_BOX_MAX_QTY = 10;

export function giftBoxTotalFor(qty: number): number {
  const clamped = Math.min(GIFT_BOX_MAX_QTY, Math.max(0, Math.floor(qty)));
  return round2(GIFT_BOX_PRICE * clamped);
}
