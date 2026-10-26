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
    expect(checkPatches(["champions_league", "league", "club_world_cup"], club)).toMatch(/2/);
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
