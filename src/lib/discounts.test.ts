import { describe, it, expect } from "vitest";
import { discountAmount, codesCanCombine, shirtsSubtotal } from "./discounts";

const ILS = (n: number) => n * 100;

describe("discountAmount", () => {
  it("takes a percent off the subtotal, rounded to the agora", () => {
    // 10% of ₪95.50 = ₪9.55 exactly -> no rounding edge, but check a case that isn't a whole agora
    expect(discountAmount({ kind: "percent", value: 10, min_order: 0 }, 9551)).toBe(955); // round(955.1) = 955
  });

  it("takes a fixed amount off, in agorot", () => {
    expect(discountAmount({ kind: "fixed", value: ILS(20), min_order: 0 }, ILS(100))).toBe(ILS(20));
  });

  it("never exceeds the subtotal", () => {
    expect(discountAmount({ kind: "fixed", value: ILS(500), min_order: 0 }, ILS(100))).toBe(ILS(100));
    expect(discountAmount({ kind: "percent", value: 100, min_order: 0 }, ILS(100))).toBe(ILS(100));
  });

  it("is zero below the minimum order", () => {
    expect(discountAmount({ kind: "fixed", value: ILS(20), min_order: ILS(200) }, ILS(100))).toBe(0);
  });

  it("applies exactly at the minimum order", () => {
    expect(discountAmount({ kind: "fixed", value: ILS(20), min_order: ILS(200) }, ILS(200))).toBe(ILS(20));
  });

  it("never goes negative for a zero or bogus subtotal", () => {
    expect(discountAmount({ kind: "percent", value: 10, min_order: 0 }, 0)).toBe(0);
  });
});

describe("codesCanCombine", () => {
  it("allows zero or one code with no stackable flag needed", () => {
    expect(codesCanCombine([])).toBe(true);
    expect(codesCanCombine([{ stackable: false }])).toBe(true);
  });

  it("allows two or more only when every one of them is stackable", () => {
    expect(codesCanCombine([{ stackable: true }, { stackable: true }])).toBe(true);
    expect(codesCanCombine([{ stackable: true }, { stackable: false }])).toBe(false);
    expect(codesCanCombine([{ stackable: false }, { stackable: false }])).toBe(false);
  });
});

describe("the first-order welcome code (₪30 off from ₪300)", () => {
  const welcome = { kind: "fixed" as const, value: ILS(30), min_order: ILS(300) };
  it("is worth nothing just under ₪300", () => {
    expect(discountAmount(welcome, ILS(300) - 1)).toBe(0);
  });
  it("takes ₪30 off at ₪300 and above", () => {
    expect(discountAmount(welcome, ILS(300))).toBe(ILS(30));
    expect(discountAmount(welcome, ILS(415))).toBe(ILS(30));
  });
});

describe("shirts-only codes (owner request 2026-11-15)", () => {
  const bf = { kind: "percent" as const, value: 15, min_order: 35000, applies_to: "shirts" };
  it("takes 15% off the shirts' price only, the minimum still on the whole order", () => {
    // 4 shirts ₪99 = 396 + names/patches/accessories 60 -> items 456: 15% of 396 = 59.40
    expect(discountAmount(bf, 45600, 39600)).toBe(5940);
  });
  it("needs the whole items total to reach the minimum", () => {
    expect(discountAmount(bf, 34999, 30000)).toBe(0);
    expect(discountAmount(bf, 35000, 20000)).toBe(3000);
  });
  it("an 'order' code still uses the whole items total", () => {
    expect(discountAmount({ ...bf, applies_to: "order" }, 45600, 39600)).toBe(6840);
  });
});

describe("shirtsSubtotal", () => {
  it("counts unit price + size price per shirt, not names or patches", () => {
    const q = { lines: [
      { unitPrice: 9900, qty: 2, addons: [{ id: "name_number", amount: 1999 }, { id: "patch", amount: 999 }] },
      { unitPrice: 11500, qty: 1, addons: [{ id: "size_3xl", amount: 900 }] },
    ] };
    expect(shirtsSubtotal(q)).toBe(9900 * 2 + 11500 + 900);
  });
});
