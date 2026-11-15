import { describe, expect, it } from "vitest";
import { saleAmount, saleOn, type Sale } from "./sale";

const sale: Sale = { code: "BF", kind: "percent", value: 15, minOrder: 350, startsAt: "2026-11-15T10:00:00+00:00", endsAt: "2026-11-30T22:00:00+00:00" };

describe("saleOn", () => {
  it("is on only between start and end", () => {
    expect(saleOn(Date.parse("2026-11-15T09:59:59Z"), sale)).toBe(false);
    expect(saleOn(Date.parse("2026-11-15T10:00:00Z"), sale)).toBe(true);
    expect(saleOn(Date.parse("2026-11-27T12:00:00Z"), sale)).toBe(true);
    expect(saleOn(Date.parse("2026-11-30T22:00:00Z"), sale)).toBe(false);
  });
  it("is off without a sale or dates", () => {
    expect(saleOn(Date.now(), null)).toBe(false);
    expect(saleOn(Date.now(), { ...sale, endsAt: "" })).toBe(false);
  });
  it("formats the amount", () => {
    expect(saleAmount(sale)).toBe("15%");
    expect(saleAmount({ kind: "fixed", value: 30 })).toBe("₪30");
  });
});
