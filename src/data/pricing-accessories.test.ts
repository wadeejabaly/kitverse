import { describe, expect, it } from "vitest";
import { accessoryDeal, accessoryDeals, accessoryListPrice } from "./pricing";
import { getVisibleAccessories } from "./accessories";

const during = new Date("2026-11-10T15:00:00Z");
const after = new Date("2026-11-11T08:00:00Z");

describe("storefront accessory prices (from the price list, same as the server)", () => {
  it("keychain ₪18, scarf ₪50", () => {
    expect(accessoryListPrice("keychain")).toBe(18);
    expect(accessoryListPrice("scarf")).toBe(50);
    expect(getVisibleAccessories().filter((a) => a.category === "scarf").every((a) => a.price === 50)).toBe(true);
  });
  it("scarf deal on 10 Nov (Israel day): ₪10 off one scarf per shirt", () => {
    expect(accessoryDeal("scarf", during)?.price).toBe(40);
    expect(accessoryDeals([{ category: "scarf", qty: 2 }, { category: "keychain", qty: 1 }], 1, during)).toEqual([{ category: "scarf", qty: 1, saving: 10 }]);
    expect(accessoryDeals([{ category: "scarf", qty: 1 }, { category: "scarf", qty: 1 }], 3, during)).toEqual([{ category: "scarf", qty: 2, saving: 20 }]);
    expect(accessoryDeals([{ category: "scarf", qty: 2 }], 0, during)).toEqual([]);
  });
  it("gone after the day", () => {
    expect(accessoryDeal("scarf", after)).toBeNull();
    expect(accessoryDeals([{ category: "scarf", qty: 2 }], 2, after)).toEqual([]);
  });
});
