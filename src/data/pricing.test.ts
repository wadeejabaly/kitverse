import { describe, expect, it } from "vitest";
import {
  ADDONS,
  DELIVERY_REGIONS,
  SHIPPING_ILS_BY_REGION,
  SIZES,
  VERSIONS,
  cartTotals,
  isDeliveryRegion,
  isRetroSeason,
  priceFor,
  priceLine,
  seasonYear,
  shippingFor,
  sizeSurcharge,
} from "./pricing";
import type { Size } from "./types";

const NON_SURCHARGE_SIZES: Size[] = ["S", "M", "L", "XL", "XXL"];

// Real, non-retro seasons as they appear in the catalogue.
const CURRENT_SEASONS = ["2026/27", "2026", "2025/26"];
// 2022 and earlier — Retro, whatever the exact string shape.
const RETRO_SEASONS = ["2022", "2021/22", "2020", "1998/99"];

describe("seasonYear + isRetroSeason", () => {
  it("reads the first four-digit year out of a season string", () => {
    expect(seasonYear("2026/27")).toBe(2026);
    expect(seasonYear("2025/26")).toBe(2025);
    expect(seasonYear("2026")).toBe(2026);
  });

  it("is Retro at 2022 and earlier, not Retro at 2023 and later", () => {
    for (const season of RETRO_SEASONS) expect(isRetroSeason(season)).toBe(true);
    for (const season of CURRENT_SEASONS) expect(isRetroSeason(season)).toBe(false);
    expect(isRetroSeason("2023")).toBe(false);
    expect(isRetroSeason("2022/23")).toBe(true); // year read is 2022
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
    expect(ADDONS.nameNumber).toBe(39);
    expect(ADDONS.badge).toBe(19);
  });
});

describe("regional shipping", () => {
  it("has exactly the four confirmed regions at the confirmed rates", () => {
    expect(DELIVERY_REGIONS).toEqual(["north", "center", "negev", "jerusalem"]);
    expect(shippingFor("north")).toBe(50);
    expect(shippingFor("center")).toBe(60);
    expect(shippingFor("negev")).toBe(70);
    expect(shippingFor("jerusalem")).toBe(100);
  });

  it("SHIPPING_ILS_BY_REGION agrees with shippingFor for every region", () => {
    for (const region of DELIVERY_REGIONS) {
      expect(SHIPPING_ILS_BY_REGION[region]).toBe(shippingFor(region));
    }
  });

  it("isDeliveryRegion accepts the closed set and nothing else", () => {
    for (const region of DELIVERY_REGIONS) expect(isDeliveryRegion(region)).toBe(true);
    for (const bogus of ["", "NORTH", "tel-aviv", null, undefined, 0, {}]) {
      expect(isDeliveryRegion(bogus)).toBe(false);
    }
  });
});

describe("priceLine + cartTotals — addon math and totals", () => {
  it("priceLine with no addons equals priceFor × qty", () => {
    const line = priceLine("2026/27", "M", "fan", 2);
    expect(line.unitPrice).toBe(95);
    expect(line.lineTotal).toBe(190);
  });

  it("priceLine adds nameNumber and badge onto the unit price before multiplying by qty", () => {
    const line = priceLine("2026/27", "M", "fan", 3, { nameNumber: true, badge: true });
    expect(line.unitPrice).toBe(95 + 39 + 19);
    expect(line.lineTotal).toBe((95 + 39 + 19) * 3);
  });

  it("priceLine respects the size surcharge together with addons", () => {
    const line = priceLine("2026/27", "4XL", "player", 1, { nameNumber: true });
    // player base 110 + 12 surcharge + 39 name&number
    expect(line.unitPrice).toBe(110 + 12 + 39);
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
      priceLine("2022", "L", "player", 2, { badge: true }),
    ];
    const totals = cartTotals(lines, shippingFor("center"));
    const expectedSubtotal = 95 + (135 + 19) * 2;
    expect(totals.subtotal).toBe(expectedSubtotal);
    expect(totals.shipping).toBe(60);
    expect(totals.total).toBe(expectedSubtotal + 60);
  });

  it("cartTotals charges no shipping for an empty cart even if a rate is passed", () => {
    const totals = cartTotals([], shippingFor("jerusalem"));
    expect(totals.subtotal).toBe(0);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(0);
  });

  it("cartTotals defaults shipping to 0 when none is given (the cart page, pre-checkout)", () => {
    const totals = cartTotals([priceLine("2026/27", "S", "fan", 1)]);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(95);
  });

  it("cartTotals still charges shipping exactly once for a single-item cart", () => {
    const totals = cartTotals([priceLine("2026/27", "S", "fan", 1)], shippingFor("north"));
    expect(totals.shipping).toBe(50);
    expect(totals.total).toBe(95 + 50);
  });
});
