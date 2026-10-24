import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { quote, PricingError, type CartItem } from "./engine";
import { PriceListData } from "./schema";

// the real draft price list - tests double as a check that the JSON is valid
const list = PriceListData.parse(JSON.parse(readFileSync("src/lib/pricing/fixture.price-list.json", "utf8")));
const ILS = (n: number) => n * 100;

let n = 0;
const shirt = (o: Partial<CartItem> = {}): CartItem => ({
  key: `i${++n}`, title: "shirt", audience: "adult", version: "player", sleeve: "short", era: "current",
  size: "L", qty: 1, ...o,
});

describe("price groups", () => {
  it("prices each group from the list", () => {
    const q = quote(list, { items: [
      shirt({ version: "fan" }), shirt({ version: "player" }), shirt({ era: "retro" }),
      shirt({ version: "fan", sleeve: "long" }), shirt({ sleeve: "long" }), shirt({ era: "retro", sleeve: "long" }),
      shirt({ audience: "kids", version: "fan" }),
    ] });
    expect(q.lines.map((l) => l.groupId)).toEqual(["fan", "player", "retro", "fan_long", "player_long", "retro_long", "kids_kit"]);
    // 3 current player shirts (1 short + 1 long... only 2 player current) -> no bundle here
    expect(q.offer).toBeNull();
    expect(q.itemsTotal).toBe(ILS(95 + 110 + 135 + 105 + 120 + 145 + 160));
  });

  it("women's cut is priced as fan", () => {
    expect(quote(list, { items: [shirt({ audience: "women", version: "fan" })] }).lines[0].groupId).toBe("fan");
  });

  it("adult kit (shirt + shorts) uses the kit price", () => {
    expect(quote(list, { items: [shirt({ kitWithShorts: true, version: "fan" })] }).lines[0].groupId).toBe("adult_kit");
  });
});

// totals the owner actually quoted in the DMs (with today's draft list)
describe("real DM orders", () => {
  it("3 player + 3 names + north = 410 (ward/dima)", () => {
    const q = quote(list, { items: [1, 2, 3].map(() => shirt({ printNameNumber: true })), zoneId: "north" });
    expect(q.total).toBe(ILS(410));
    expect(q.summaryAr).toBe("300 البلايز / 60 الاسماء / 50 توصيل = 410₪ واصل لباب البيت");
  });

  it("3 player + names + patches + north = 446 (karam/ryn)", () => {
    const q = quote(list, { items: [1, 2, 3].map(() => shirt({ printNameNumber: true, patches: 1 })), zoneId: "north" });
    expect(q.total).toBe(ILS(446));
  });

  it("4 shirts: 4th at 100, names + patches + centre = 588", () => {
    const q = quote(list, { items: [1, 2, 3, 4].map(() => shirt({ printNameNumber: true, patches: 1 })), zoneId: "center" });
    expect(q.total).toBe(ILS(588));
  });

  it("single player + name + north = 180", () => {
    expect(quote(list, { items: [shirt({ printNameNumber: true })], zoneId: "north" }).total).toBe(ILS(180));
  });

  it("3 fan + names + patches + north = 431 (fan is not in the bundle)", () => {
    const q = quote(list, { items: [1, 2, 3].map(() => shirt({ version: "fan", printNameNumber: true, patches: 1 })), zoneId: "north" });
    expect(q.offer).toBeNull();
    expect(q.total).toBe(ILS(431));
  });

  it("3 player in 4XL to Jerusalem = 300 + 36 + 100", () => {
    const q = quote(list, { items: [1, 2, 3].map(() => shirt({ size: "4XL" })), zoneId: "jer_ws_eilat" });
    expect(q.total).toBe(ILS(436));
  });

  it("3 long-sleeve player = 330", () => {
    expect(quote(list, { items: [1, 2, 3].map(() => shirt({ sleeve: "long" })) }).itemsTotal).toBe(ILS(330));
  });

  it("mixed: 2 short + 1 long = 310", () => {
    const q = quote(list, { items: [shirt(), shirt(), shirt({ sleeve: "long" })] });
    expect(q.itemsTotal).toBe(ILS(310));
    expect(q.offer?.saving).toBe(ILS(30));
  });

  it("retro is never in the bundle", () => {
    const q = quote(list, { items: [shirt(), shirt(), shirt({ era: "retro" })] });
    expect(q.offer).toBeNull();
    expect(q.itemsTotal).toBe(ILS(110 + 110 + 135));
  });

  it("qty counts toward the bundle (one line, qty 3)", () => {
    expect(quote(list, { items: [shirt({ qty: 3 })] }).itemsTotal).toBe(ILS(300));
  });

  it("6 shirts = 600", () => {
    expect(quote(list, { items: [shirt({ qty: 6 })] }).itemsTotal).toBe(ILS(600));
  });
});

describe("order add-ons, discounts, delivery", () => {
  it("box is charged once per order", () => {
    const q = quote(list, { items: [shirt({ boxAddonId: "box_real" }), shirt({ boxAddonId: "box_real" }), shirt()] });
    expect(q.orderAddons).toHaveLength(1);
    expect(q.itemsTotal).toBe(ILS(300 + 30));
  });

  it("approved discounts reduce the total but never below zero", () => {
    const q = quote(list, { items: [shirt()], adjustments: [{ label: "x", amount: ILS(500) }], zoneId: "north" });
    expect(q.discountTotal).toBe(ILS(110));
    expect(q.total).toBe(ILS(50));
  });

  it("reports what is still missing", () => {
    expect(quote(list, { items: [] }).missing).toEqual(["items", "zone"]);
    expect(quote(list, { items: [shirt()] }).summaryAr).toContain("بدون توصيل");
  });

  it("rejects unknown zones and add-ons", () => {
    expect(() => quote(list, { items: [shirt()], zoneId: "mars" })).toThrow(PricingError);
    expect(() => quote(list, { items: [shirt({ boxAddonId: "box_x" })] })).toThrow(PricingError);
  });

  it("inactive or expired offers are ignored", () => {
    const off = { ...list, offers: list.offers.map((o) => ({ ...o, ends_at: "2000-01-01" })) };
    expect(quote(off, { items: [shirt({ qty: 3 })] }).itemsTotal).toBe(ILS(330));
  });
});

describe("order add-ons with a quantity", () => {
  const withBox = { ...list, addons: [...list.addons, { id: "gift_box", name_en: "Gift box", name_ar: "بوكس هدية", price: 34.99, per: "order" as const }] };
  it("charges each gift box", () => {
    const q = quote(withBox, { items: [shirt()], orderAddons: [{ id: "gift_box", qty: 2 }] });
    expect(q.orderAddons[0].amount).toBe(6998);
    expect(q.itemsTotal).toBe(ILS(110) + 6998);
  });
  it("rejects per-shirt add-ons as order add-ons", () => {
    expect(() => quote(withBox, { items: [shirt()], orderAddons: [{ id: "name_number", qty: 1 }] })).toThrow();
  });
});
