import { describe, expect, it } from "vitest";
import {
  ADDONS,
  GIFT_BOX_MAX_QTY,
  GIFT_BOX_PRICE,
  SHIPPING_ILS_BY_TIER,
  SIZES,
  VERSIONS,
  cartTotals,
  giftBoxTotalFor,
  isRetroSeason,
  patchesTotal,
  priceFor,
  priceLine,
  round2,
  seasonYear,
  sizeSurcharge,
} from "./pricing";
import type { Size } from "./types";

const NON_SURCHARGE_SIZES: Size[] = ["S", "M", "L", "XL", "XXL"];

// Real, non-retro seasons as they appear in the catalogue.
const CURRENT_SEASONS = ["2026/27", "2026", "2025/26"];
// 2023 and earlier — Retro, whatever the exact string shape.
const RETRO_SEASONS = ["2023", "2022", "2021/22", "2020", "1998/99"];

describe("seasonYear + isRetroSeason", () => {
  it("reads the first four-digit year out of a season string", () => {
    expect(seasonYear("2026/27")).toBe(2026);
    expect(seasonYear("2025/26")).toBe(2025);
    expect(seasonYear("2026")).toBe(2026);
  });

  it("is Retro at 2023 and earlier, not Retro at 2024 and later", () => {
    for (const season of RETRO_SEASONS) expect(isRetroSeason(season)).toBe(true);
    for (const season of CURRENT_SEASONS) expect(isRetroSeason(season)).toBe(false);
    expect(isRetroSeason("2024")).toBe(false);
    expect(isRetroSeason("2023/24")).toBe(true); // year read is 2023
  });

  it("treats an unparseable season as NOT retro, so it never over-charges", () => {
    expect(isRetroSeason("")).toBe(false);
    expect(isRetroSeason("season unknown")).toBe(false);
    expect(priceFor("season unknown", "M", "fan")).toBe(95);
  });
});

describe("priceFor — flat ladder by type, no season split for Fan/Player", () => {
  it("Fan is 95 and Player is 110 at every non-retro season and non-surcharge size", () => {
    for (const season of CURRENT_SEASONS) {
      for (const size of NON_SURCHARGE_SIZES) {
        expect(priceFor(season, size, "fan")).toBe(95);
        expect(priceFor(season, size, "player")).toBe(110);
      }
    }
  });

  it("Retro is 135 regardless of fan/player choice, at every retro season", () => {
    for (const season of RETRO_SEASONS) {
      for (const size of NON_SURCHARGE_SIZES) {
        expect(priceFor(season, size, "fan")).toBe(135);
        expect(priceFor(season, size, "player")).toBe(135);
      }
    }
  });
});

describe("priceFor — 3XL/4XL surcharge", () => {
  it("adds +9 at 3XL and +12 at 4XL, on top of any base price", () => {
    for (const season of [...CURRENT_SEASONS, ...RETRO_SEASONS]) {
      for (const version of VERSIONS) {
        const base = priceFor(season, "XXL", version); // just below the boundary
        expect(priceFor(season, "3XL", version)).toBe(base + 9);
        expect(priceFor(season, "4XL", version)).toBe(base + 12);
      }
    }
  });

  it("sizeSurcharge agrees with the difference priceFor actually applies", () => {
    for (const size of SIZES) {
      expect(priceFor("2026/27", size, "fan") - priceFor("2026/27", "S", "fan")).toBe(
        sizeSurcharge(size),
      );
    }
    expect(sizeSurcharge("XXL")).toBe(0);
    expect(sizeSurcharge("3XL")).toBe(9);
    expect(sizeSurcharge("4XL")).toBe(12);
  });

  it("full ladder spot-check", () => {
    expect(priceFor("2026/27", "S", "fan")).toBe(95);
    expect(priceFor("2026/27", "S", "player")).toBe(110);
    expect(priceFor("2026/27", "3XL", "fan")).toBe(104);
    expect(priceFor("2026/27", "4XL", "player")).toBe(122);
    expect(priceFor("2022", "S", "fan")).toBe(135);
    expect(priceFor("2022", "S", "player")).toBe(135);
    expect(priceFor("2022", "3XL", "fan")).toBe(144);
    expect(priceFor("2022", "4XL", "player")).toBe(147);
  });

  it("covers every season × size × version combination without throwing", () => {
    for (const season of [...CURRENT_SEASONS, ...RETRO_SEASONS]) {
      for (const size of SIZES) {
        for (const version of VERSIONS) {
          expect(Number.isFinite(priceFor(season, size, version))).toBe(true);
        }
      }
    }
  });
});

describe("ADDONS", () => {
  it("exposes the confirmed addon prices", () => {
    // Owner decision: name + number moved from a flat 20 to ₪19.99.
    expect(ADDONS.nameNumber).toBe(19.99);
    // Owner decision 2026-10-26: the 1st patch on a shirt is ₪12.99 (the
    // 2nd and 3rd are cheaper — see patchesTotal below).
    expect(ADDONS.patch).toBe(12.99);
  });
});

describe("patchesTotal — tiered by how many patches are on the same shirt", () => {
  it("is free with no patches", () => {
    expect(patchesTotal(0)).toBe(0);
  });

  it("charges ₪12.99 / ₪9.99 / ₪6.99 for the 1st / 2nd / 3rd patch", () => {
    expect(patchesTotal(1)).toBe(12.99);
    expect(patchesTotal(2)).toBe(round2(12.99 + 9.99));
    expect(patchesTotal(3)).toBe(round2(12.99 + 9.99 + 6.99));
  });

  it("repeats the last tier for any patch beyond the named ones", () => {
    expect(patchesTotal(4)).toBe(round2(12.99 + 9.99 + 6.99 + 6.99));
  });
});

describe("round2 — cent-exact rounding for the fractional add-ons", () => {
  it("rounds to the nearest cent", () => {
    expect(round2(11.99 * 3)).toBe(35.97);
    expect(round2(34.99 * 2)).toBe(69.98);
    expect(round2(95)).toBe(95);
  });

  it("never leaves floating-point drift in a displayed total", () => {
    for (let qty = 1; qty <= 10; qty += 1) {
      const total = round2(11.99 * qty);
      expect(Number(total.toFixed(2))).toBe(total);
    }
  });
});

describe("delivery shipping tiers", () => {
  // Figures come from the committed src/data/price-list.json (regenerated by
  // `npm run store:export` from whatever the admin has applied in /admin/pricing),
  // not hardcoded here — this just checks the two tiers stay distinct and finite.
  it("has exactly the two tiers, north cheaper than everywhere else", () => {
    expect(Object.keys(SHIPPING_ILS_BY_TIER).sort()).toEqual(["north", "rest"]);
    expect(Number.isFinite(SHIPPING_ILS_BY_TIER.north)).toBe(true);
    expect(Number.isFinite(SHIPPING_ILS_BY_TIER.rest)).toBe(true);
  });
});

describe("priceLine + cartTotals — addon math and totals", () => {
  it("priceLine with no addons equals priceFor × qty", () => {
    const line = priceLine("2026/27", "M", "fan", 2);
    expect(line.unitPrice).toBe(95);
    expect(line.lineTotal).toBe(190);
  });

  it("priceLine adds nameNumber and a patch onto the unit price before multiplying by qty", () => {
    const line = priceLine("2026/27", "M", "fan", 3, { nameNumber: true, patchCount: 1 });
    expect(line.unitPrice).toBe(round2(95 + 19.99 + 12.99));
    expect(line.lineTotal).toBe(round2((95 + 19.99 + 12.99) * 3));
  });

  it("a second patch on the same shirt costs the cheaper 2nd tier, not another 1st-tier charge", () => {
    const two = priceLine("2026/27", "M", "fan", 1, { patchCount: 2 });
    expect(two.unitPrice).toBe(round2(95 + 12.99 + 9.99));
  });

  it("a patch count of 0 charges nothing, same as omitting it", () => {
    const withZero = priceLine("2026/27", "M", "fan", 1, { patchCount: 0 });
    const omitted = priceLine("2026/27", "M", "fan", 1);
    expect(withZero.unitPrice).toBe(95);
    expect(withZero.unitPrice).toBe(omitted.unitPrice);
  });

  it("priceLine respects the size surcharge together with addons", () => {
    const line = priceLine("2026/27", "4XL", "player", 1, { nameNumber: true });
    // player base 110 + 12 surcharge + 19.99 name&number
    expect(line.unitPrice).toBe(round2(110 + 12 + 19.99));
  });

  it("priceLine on a retro season ignores the version argument", () => {
    const asFan = priceLine("2019/20", "M", "fan", 1);
    const asPlayer = priceLine("2019/20", "M", "player", 1);
    expect(asFan.unitPrice).toBe(135);
    expect(asPlayer.unitPrice).toBe(135);
  });

  it("cartTotals sums line totals into subtotal and adds the given shipping once", () => {
    const lines = [
      priceLine("2026/27", "M", "fan", 1),
      priceLine("2022", "L", "player", 2, { patchCount: 1 }),
    ];
    const rest = SHIPPING_ILS_BY_TIER.rest;
    const totals = cartTotals(lines, rest);
    const expectedSubtotal = round2(95 + round2(135 + 12.99) * 2);
    expect(totals.subtotal).toBe(expectedSubtotal);
    expect(totals.shipping).toBe(rest);
    expect(totals.giftBox).toBe(0);
    expect(totals.total).toBe(round2(expectedSubtotal + rest));
  });

  it("cartTotals charges no shipping or gift box for an empty cart even if given", () => {
    const totals = cartTotals([], SHIPPING_ILS_BY_TIER.rest, 3);
    expect(totals.subtotal).toBe(0);
    expect(totals.shipping).toBe(0);
    expect(totals.giftBox).toBe(0);
    expect(totals.total).toBe(0);
  });

  it("cartTotals defaults shipping and gift box to 0 when omitted (the cart page, pre-checkout)", () => {
    const totals = cartTotals([priceLine("2026/27", "S", "fan", 1)]);
    expect(totals.shipping).toBe(0);
    expect(totals.giftBox).toBe(0);
    expect(totals.total).toBe(95);
  });

  it("cartTotals still charges shipping exactly once for a single-item cart", () => {
    const north = SHIPPING_ILS_BY_TIER.north;
    const totals = cartTotals([priceLine("2026/27", "S", "fan", 1)], north);
    expect(totals.shipping).toBe(north);
    expect(totals.total).toBe(95 + north);
  });

  it("cartTotals adds the gift box exactly once, on top of subtotal and shipping", () => {
    const north = SHIPPING_ILS_BY_TIER.north;
    const totals = cartTotals(
      [priceLine("2026/27", "S", "fan", 1)],
      north,
      2,
    );
    expect(totals.giftBox).toBe(round2(GIFT_BOX_PRICE * 2));
    expect(totals.total).toBe(round2(95 + north + GIFT_BOX_PRICE * 2));
  });
});

describe("giftBoxTotalFor — the checkout-only gift-box add-on", () => {
  it("is free for a quantity of zero", () => {
    expect(giftBoxTotalFor(0)).toBe(0);
  });

  it("charges the confirmed ₪34.99 per box", () => {
    expect(GIFT_BOX_PRICE).toBe(34.99);
    expect(giftBoxTotalFor(1)).toBe(34.99);
    expect(giftBoxTotalFor(2)).toBe(69.98);
    expect(giftBoxTotalFor(3)).toBe(round2(34.99 * 3));
  });

  it("clamps to 0..GIFT_BOX_MAX_QTY rather than throwing or over-charging", () => {
    expect(giftBoxTotalFor(-5)).toBe(0);
    expect(giftBoxTotalFor(GIFT_BOX_MAX_QTY + 50)).toBe(
      round2(GIFT_BOX_PRICE * GIFT_BOX_MAX_QTY),
    );
  });

  it("never leaves a fractional-cent result", () => {
    for (let qty = 0; qty <= GIFT_BOX_MAX_QTY; qty += 1) {
      const total = giftBoxTotalFor(qty);
      expect(Number(total.toFixed(2))).toBe(total);
    }
  });
});
