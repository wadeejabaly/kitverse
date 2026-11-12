import { describe, expect, it } from "vitest";
import { isValidSeason, parseSeasonInput, seasonChoices, shirtNames } from "./shirt-names";

// owner request 2026-11-12: one name format for every shirt added in admin
describe("shirtNames", () => {
  const rm = { name: "Real Madrid", nameAr: "ريال مدريد", nameHe: "ריאל מדריד" };
  it("retro club shirt, matching the existing catalogue format", () => {
    expect(shirtNames({ team: rm, season: "2016/17", kit: "Away", retro: true })).toEqual({
      en: "Real Madrid 2016/17 Retro Away Shirt",
      ar: "قميص ريال مدريد 2016/17 الاحتياطي ريترو",
      he: "חולצת חוץ רטרו ריאל מדריד 2016/17",
      handle: "real-madrid-2016-17-retro-away-shirt",
    });
  });
  it("current national-team shirt", () => {
    const n = shirtNames({ team: { name: "England", nameAr: "إنجلترا", nameHe: "אנגליה" }, season: "2026", kit: "Home", retro: false });
    expect([n.en, n.ar, n.he]).toEqual(["England 2026 Home Shirt", "قميص إنجلترا 2026 الأساسي", "חולצת בית אנגליה 2026"]);
  });
  it("seasons", () => {
    expect(isValidSeason("2016/17", "club")).toBe(true);
    expect(isValidSeason("2016/18", "club")).toBe(false);
    expect(isValidSeason("1999/00", "club")).toBe(true);
    expect(isValidSeason("2026", "national")).toBe(true);
    expect(isValidSeason("2026/27", "national")).toBe(false);
    expect(seasonChoices("club")[0]).toBe("2026/27");
    expect(seasonChoices("national")[0]).toBe("2026");
  });
});

describe("typed seasons (admin Add shirt, owner request 2026-11-13)", () => {
  it("turns the ways a club season is typed into one format", () => {
    for (const s of ["2010/11", "2010-11", "10/11", "2010/2011", "2010 11", "2010", " 2010.11 "]) expect(parseSeasonInput(s, "club")).toBe("2010/11");
    expect(parseSeasonInput("98/99", "club")).toBe("1998/99");
    expect(parseSeasonInput("1999/00", "club")).toBe("1999/00");
  });
  it("national teams are a year", () => {
    expect(parseSeasonInput("2026", "national")).toBe("2026");
    expect(parseSeasonInput("2026/27", "national")).toBe("2026");
  });
  it("refuses what is not a season", () => {
    for (const s of ["", "abc", "2010/14", "1850", "201"]) expect(parseSeasonInput(s, "club")).toBeNull();
  });
});
