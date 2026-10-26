import { describe, it, expect } from "vitest";
import { discountAmount } from "./discounts";

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
