import { describe, it, expect } from "vitest";
import { normalizeSize, normalizePhone, validatePrint, checkPatches } from "./rules";
import { normalize, normalizeSeason, similarity } from "../text";

describe("sizes", () => {
  it("normalises what customers write", () => {
    expect(normalizeSize("xxl", "adult")).toBe("XXL");
    expect(normalizeSize("2XL", "adult")).toBe("XXL");
    expect(normalizeSize("XXXL", "adult")).toBe("3XL");
    expect(normalizeSize("medium", "adult")).toBe("M");
    expect(normalizeSize("ميديوم", "adult")).toBe("M");
    expect(normalizeSize("لارج", "adult")).toBe("L");
    expect(normalizeSize("26", "kids")).toBe("26");
    expect(normalizeSize("5XL", "adult")).toBeNull();
    expect(normalizeSize("XL", "kids")).toBeNull();
  });
});

describe("phones", () => {
  it("accepts Israeli formats", () => {
    expect(normalizePhone("052-123 4567")).toBe("0521234567");
    expect(normalizePhone("+972 52 123 4567")).toBe("0521234567");
    expect(normalizePhone("04-6012345")).toBe("046012345");
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("print", () => {
  it("validates name and number", () => {
    expect(validatePrint("LAMINE", "10")).toBeNull();
    expect(validatePrint("ابو الامين", "10")).toBeNull();
    expect(validatePrint("X", "710")).toMatch(/0-99/);
    expect(validatePrint("A".repeat(15), "1")).toMatch(/14/);
  });
});

describe("patches", () => {
  const club = { type: "club" as const, league_id: "la-liga" };
  const serieAClub = { type: "club" as const, league_id: "serie-a" };
  const nation = { type: "national" as const, league_id: null };
  it("allows normal combinations", () => {
    expect(checkPatches(["champions_league", "league"], club)).toBeNull();
    expect(checkPatches(["world_cup"], nation)).toBeNull();
  });
  it("flags odd ones for the owner", () => {
    expect(checkPatches(["world_cup"], club)).toMatch(/national/);
    expect(checkPatches(["league"], nation)).toMatch(/clubs/);
    expect(checkPatches(["champions_league", "league", "europa_league"], club)).toMatch(/2/);
  });
  it("a national-team shirt can carry all 3 World Cup patches at once", () => {
    expect(checkPatches(["world_cup", "world_cup_peace", "world_cup_champions"], nation)).toBeNull();
    expect(checkPatches(["world_cup", "world_cup_peace", "world_cup_champions", "world_cup"], nation)).toMatch(/3|twice/);
  });
  it("Coppa Italia is Serie A only", () => {
    expect(checkPatches(["coppa_italia"], serieAClub)).toBeNull();
    expect(checkPatches(["coppa_italia"], club)).toMatch(/league/);
    expect(checkPatches(["coppa_italia"], nation)).toMatch(/clubs/);
  });
});

describe("text", () => {
  it("normalises Arabic and seasons", () => {
    expect(normalize("البَرسا")).toBe("البرسا");
    expect(normalize("أتلتيكو")).toBe("اتلتيكو");
    expect(normalizeSeason("25/26")).toBe("2025/26");
    expect(normalizeSeason("2025-26")).toBe("2025/26");
    expect(normalizeSeason("٢٠٢٦")).toBe("2026");
    expect(similarity("Atlético Madrid", "atletico madrid")).toBe(1);
  });
});

describe("patch cap: La Liga 2025/26 + 2026/27 take only 1 (owner decision 2026-11-10)", () => {
  const laLiga = { type: "club" as const, league_id: "la-liga" };
  it("refuses a second patch on La Liga 2025/26 and 2026/27, in any season spelling", () => {
    for (const season of ["2025/26", "2026/27", "25/26", "2026-27"]) {
      expect(checkPatches(["league"], laLiga, season)).toBeNull();
      expect(checkPatches(["league", "champions_league"], laLiga, season)).toBe("only 1 patch allowed on this shirt");
    }
  });
  it("keeps 2 for older La Liga seasons, other leagues, and 3 for national teams", () => {
    expect(checkPatches(["league", "champions_league"], laLiga, "2024/25")).toBeNull();
    expect(checkPatches(["league", "champions_league"], laLiga, "2008/09")).toBeNull();
    expect(checkPatches(["league", "champions_league"], { type: "club", league_id: "premier-league" }, "2026/27")).toBeNull();
    expect(checkPatches(["world_cup", "world_cup_peace", "world_cup_champions"], { type: "national", league_id: null }, "2026")).toBeNull();
  });
});
