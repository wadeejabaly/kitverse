import { describe, expect, it } from "vitest";
import { KIDS_SIZES, kidsSizeForAge, kidsSizeForHeight, priceFor } from "./pricing";
import { shirtNames } from "@/lib/catalog/shirt-names";
import { quote } from "@/lib/pricing/engine";
import list from "./price-list.json";
import { PriceListData } from "@/lib/pricing/schema";

// full kits + kids kits (owner request 2026-11-15)
describe("kit prices (from the price list)", () => {
  it("adult kit fan 160, player 170, retro 180, kids kit 150 (retro kids too)", () => {
    expect(priceFor("2026/27", "M", "fan", "short", "kit")).toBe(160);
    expect(priceFor("2026/27", "M", "player", "short", "kit")).toBe(170);
    expect(priceFor("2014/15", "M", "fan", "short", "kit")).toBe(180);
    expect(priceFor("2014/15", "22", "fan", "short", "kids_kit")).toBe(150);
    expect(priceFor("2026/27", "22", "fan", "short", "kids_kit")).toBe(150);
    expect(priceFor("2026/27", "22", "player", "long", "kids_kit")).toBe(150); // kids kit: one price
  });
  it("adult kit keeps the 3XL/4XL surcharge", () => {
    expect(priceFor("2026/27", "3XL", "fan", "short", "kit")).toBe(160 + 9);
  });
  it("the server engine agrees", () => {
    const pl = PriceListData.parse(list);
    const base = { key: "1", title: "t", sleeve: "short" as const, era: "current" as const, qty: 1, printNameNumber: false, patches: 0 };
    const q = quote(pl, { zoneId: pl.delivery.zones[0].id, items: [
      { ...base, key: "a", audience: "adult", version: "fan", kitWithShorts: true, size: "M" },
      { ...base, key: "b", audience: "adult", version: "player", kitWithShorts: true, size: "M" },
      { ...base, key: "c", audience: "kids", version: "fan", kitWithShorts: true, size: "22" },
      { ...base, key: "d", audience: "adult", version: "fan", era: "retro", kitWithShorts: true, size: "M" },
      { ...base, key: "e", audience: "kids", version: "fan", era: "retro", kitWithShorts: true, size: "22" },
    ] });
    expect(q.lines.map((l) => [l.groupId, l.unitPrice])).toEqual([["adult_kit", 16000], ["adult_kit_player", 17000], ["kids_kit", 15000], ["adult_kit_retro", 18000], ["kids_kit", 15000]]);
  });
});

describe("kids size calculator (supplier chart)", () => {
  it("by height", () => {
    expect(kidsSizeForHeight(100)).toBe("16");
    expect(kidsSizeForHeight(120)).toBe("20");
    expect(kidsSizeForHeight(125)).toBe("22"); // on a boundary -> the bigger size
    expect(kidsSizeForHeight(160)).toBe("28");
    expect(kidsSizeForHeight(60)).toBeNull();
    expect(kidsSizeForHeight(200)).toBeNull();
  });
  it("by age", () => {
    expect(kidsSizeForAge(3)).toBe("16");
    expect(kidsSizeForAge(6)).toBe("20");
    expect(kidsSizeForAge(13)).toBe("28");
    expect(kidsSizeForAge(1)).toBeNull();
  });
  it("sizes 16-28", () => expect(KIDS_SIZES).toEqual(["16", "18", "20", "22", "24", "26", "28"]));
});

describe("kit names", () => {
  const rm = { name: "Real Madrid", nameAr: "ريال مدريد", nameHe: "ריאל מדריד" };
  it("adult and kids kit, all three languages", () => {
    expect(shirtNames({ team: rm, season: "2026/27", kit: "Home", retro: false, type: "kit" })).toEqual({
      en: "Real Madrid 2026/27 Home Kit", ar: "طقم ريال مدريد 2026/27 الأساسي", he: "ערכת בית ריאל מדריד 2026/27", handle: "real-madrid-2026-27-home-kit" });
    expect(shirtNames({ team: rm, season: "2026/27", kit: "Away", retro: false, type: "kids_kit" }).handle).toBe("real-madrid-2026-27-away-kids-kit");
  });
});
