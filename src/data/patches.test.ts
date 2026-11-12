import { describe, it, expect } from "vitest";
import { maxPatchesFor, patchOptionsFor } from "./patches";

describe("storefront patch picker: no-patch shirts", () => {
  const b92 = { league: "la-liga", kind: "previous" as const, team: "Barcelona", season: "1992", handle: "barcelona-1992-retro-home-shirt" };
  it("offers no patches on the Barcelona 1992 retro home shirt", () => {
    expect(patchOptionsFor(b92)).toEqual([]);
    expect(maxPatchesFor(b92)).toBe(0);
  });
  it("still offers them on other Barcelona shirts", () => {
    const b05 = { ...b92, season: "2005", handle: "barcelona-2005-06-retro-home-shirt" };
    expect(patchOptionsFor(b05).length).toBeGreaterThan(0);
    expect(maxPatchesFor(b05)).toBe(2);
  });
});

describe("storefront patch picker: Barcelona 2008/09 retro home", () => {
  const b08 = { league: "la-liga", kind: "previous" as const, team: "Barcelona", season: "2008/09", handle: "barcelona-2008-retro-home-shirt" };
  it("offers only the plain Champions League ball until the old La Liga badge photo exists", () => {
    expect(patchOptionsFor(b08).map((o) => [o.id, o.image])).toEqual([
      ["champions_league", "/patches/champions-league-general.jpg"],
    ]);
    expect(maxPatchesFor(b08)).toBe(2);
  });
});
