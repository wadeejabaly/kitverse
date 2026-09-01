import { describe, expect, it } from "vitest";
import {
  ADDONS,
  SHIPPING_ILS_DOMESTIC,
  SIZES,
  VERSIONS,
  cartTotals,
  compareAtFor,
  priceFor,
  priceLine,
} from "./pricing";
import type { Kind, Size } from "./types";

const KINDS: Kind[] = ["national", "current", "previous"];
const SURCHARGE_SIZES: Size[] = ["3XL", "4XL"];
const NON_SURCHARGE_SIZES: Size[] = ["S", "M", "L", "XL", "XXL"];

describe("priceFor — base ladder", () => {
  it("national and current season: fan 169 / player 219 at non-surcharge sizes", () => {
    for (const kind of ["national", "current"] as Kind[]) {
      for (const size of NON_SURCHARGE_SIZES) {
        expect(priceFor(kind, size, "fan")).toBe(169);
        expect(priceFor(kind, size, "player")).toBe(219);
      }
    }
  });

  it("previous season: fan 129 / player 169 at non-surcharge sizes", () => {
    for (const size of NON_SURCHARGE_SIZES) {
      expect(priceFor("previous", size, "fan")).toBe(129);
      expect(priceFor("previous", size, "player")).toBe(169);
    }
  });
});

describe("priceFor — 3XL/4XL surcharge", () => {
  it("adds +15 on top of the base price for every kind × version, at 3XL and 4XL only", () => {
    for (const kind of KINDS) {
      for (const version of VERSIONS) {
        const base = priceFor(kind, "XXL", version); // boundary just below surcharge
        for (const size of SURCHARGE_SIZES) {
          expect(priceFor(kind, size, version)).toBe(base + 15);
        }
      }
    }
  });

  it("does not apply the surcharge at XXL (the size directly below the boundary)", () => {
    expect(priceFor("current", "XXL", "fan")).toBe(169);
    expect(priceFor("previous", "XXL", "player")).toBe(169);
  });

  it("full ladder spot-check for every kind × size × version combination", () => {
    const expected: Record<string, number> = {
      "national|S|fan": 169,
      "national|S|player": 219,
      "national|4XL|fan": 184,
      "national|4XL|player": 234,
      "current|3XL|fan": 184,
      "current|3XL|player": 234,
      "previous|S|fan": 129,
      "previous|S|player": 169,
      "previous|3XL|fan": 144,
      "previous|3XL|player": 184,
      "previous|4XL|fan": 144,
      "previous|4XL|player": 184,
    };
    for (const [key, price] of Object.entries(expected)) {
      const [kind, size, version] = key.split("|") as [Kind, Size, "fan" | "player"];
      expect(priceFor(kind, size, version)).toBe(price);
    }
  });

  it("covers every kind × size × version combination without throwing", () => {
    for (const kind of KINDS) {
      for (const size of SIZES) {
        for (const version of VERSIONS) {
          expect(Number.isFinite(priceFor(kind, size, version))).toBe(true);
        }
      }
    }
  });
});

describe("compareAtFor — previous-season only", () => {
  it("is null for national and current season, at every size × version", () => {
    for (const kind of ["national", "current"] as Kind[]) {
      for (const size of SIZES) {
        for (const version of VERSIONS) {
          expect(compareAtFor(kind, size, version)).toBeNull();
        }
      }
    }
  });

  it("equals the current-season base price for previous-season at non-surcharge sizes", () => {
    for (const size of NON_SURCHARGE_SIZES) {
      expect(compareAtFor("previous", size, "fan")).toBe(169);
      expect(compareAtFor("previous", size, "player")).toBe(219);
    }
  });

  it("includes the +15 surcharge at 3XL/4XL, mirroring priceFor's boundary", () => {
    for (const size of SURCHARGE_SIZES) {
      expect(compareAtFor("previous", size, "fan")).toBe(184);
      expect(compareAtFor("previous", size, "player")).toBe(234);
    }
  });

  it("is always strictly greater than priceFor for the same size/version (a real markdown)", () => {
    for (const size of SIZES) {
      for (const version of VERSIONS) {
        const compareAt = compareAtFor("previous", size, version);
        expect(compareAt).not.toBeNull();
        expect(compareAt as number).toBeGreaterThan(priceFor("previous", size, version));
      }
    }
  });
});

describe("ADDONS and SHIPPING_ILS_DOMESTIC", () => {
  it("exposes the confirmed addon prices", () => {
    expect(ADDONS.nameNumber).toBe(39);
    expect(ADDONS.badge).toBe(19);
  });

  it("exposes the placeholder domestic shipping rate", () => {
    expect(SHIPPING_ILS_DOMESTIC).toBe(35);
  });
});

describe("priceLine + cartTotals — addon math and totals", () => {
  it("priceLine with no addons equals priceFor × qty", () => {
    const line = priceLine("current", "M", "fan", 2);
    expect(line.unitPrice).toBe(169);
    expect(line.lineTotal).toBe(338);
  });

  it("priceLine adds nameNumber and badge onto the unit price before multiplying by qty", () => {
    const line = priceLine("current", "M", "fan", 3, { nameNumber: true, badge: true });
    expect(line.unitPrice).toBe(169 + 39 + 19);
    expect(line.lineTotal).toBe((169 + 39 + 19) * 3);
  });

  it("priceLine respects the size surcharge together with addons", () => {
    const line = priceLine("previous", "4XL", "player", 1, { nameNumber: true });
    // previous player base 169 + 15 surcharge + 39 name&number
    expect(line.unitPrice).toBe(169 + 15 + 39);
  });

  it("cartTotals sums line totals into subtotal and adds shipping once", () => {
    const lines = [
      priceLine("current", "M", "fan", 1),
      priceLine("previous", "L", "player", 2, { badge: true }),
    ];
    const totals = cartTotals(lines);
    const expectedSubtotal = 169 + (169 + 19) * 2;
    expect(totals.subtotal).toBe(expectedSubtotal);
    expect(totals.shipping).toBe(SHIPPING_ILS_DOMESTIC);
    expect(totals.total).toBe(expectedSubtotal + SHIPPING_ILS_DOMESTIC);
  });

  it("cartTotals charges no shipping for an empty cart", () => {
    const totals = cartTotals([]);
    expect(totals.subtotal).toBe(0);
    expect(totals.shipping).toBe(0);
    expect(totals.total).toBe(0);
  });

  it("cartTotals still charges shipping exactly once for a single-item cart", () => {
    const totals = cartTotals([priceLine("national", "S", "fan", 1)]);
    expect(totals.shipping).toBe(SHIPPING_ILS_DOMESTIC);
    expect(totals.total).toBe(169 + SHIPPING_ILS_DOMESTIC);
  });
});
