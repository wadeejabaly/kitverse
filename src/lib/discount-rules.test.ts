import { describe, expect, it } from "vitest";
import { canCombine, codeAmounts } from "./discount-rules";

const sale = { kind: "percent" as const, value: 15, appliesTo: "shirts" as const, stackable: false, isSale: true };
const riddle = { kind: "fixed" as const, value: 5000, appliesTo: "order" as const, stackable: false, combinesWithSale: true };
const welcome = { kind: "fixed" as const, value: 3000, appliesTo: "order" as const, stackable: false };

describe("discount rules (owner 2026-11-16)", () => {
  it("riddle coupon combines with the sale only", () => {
    expect(canCombine([sale, riddle])).toBe(true);
    expect(canCombine([riddle, sale])).toBe(true);
    expect(canCombine([sale, welcome])).toBe(false);
    expect(canCombine([riddle, welcome])).toBe(false);
    expect(canCombine([sale, riddle, welcome])).toBe(false);
  });
  it("₪50 first, then 15% of what's left", () => {
    // 2 fan shirts 99+99 = 198 (19800 agorot), all shirts
    const [a, b] = codeAmounts([sale, riddle], 19800, 19800);
    expect(b).toBe(5000);
    expect(a).toBe(Math.round(14800 * 0.15)); // 2220
  });
  it("sale alone unchanged", () => {
    expect(codeAmounts([sale], 19800, 19800)).toEqual([2970]);
  });
  it("names/patches: 15% only on the shirts left after ₪50", () => {
    // shirts 9900, + name 1999 => items 11899; ₪50 off -> items 6899, shirts min(9900-5000, 6899)=4900
    expect(codeAmounts([riddle, sale], 11899, 9900)).toEqual([5000, 735]);
  });
});
