import { describe, expect, it } from "vitest";
import { checkPatches } from "@/lib/orders/rules";
import { isClubWorldChampionSeason, uclFinalPrint } from "@/lib/patch-eligibility";
import { patchPieces } from "@/lib/patch-limits";

// owner request 2026-11-12: Real Madrid 2016/17 away + "all these possible patches"
describe("chest extras: FIFA Club World Champions badge + Champions League final print", () => {
  const rm = { id: "real-madrid", type: "club" as const, league_id: "la-liga" };
  it("the full Cardiff look, piece by piece, is allowed and charged as 5 patches", () => {
    const cardiff = ["champions_league", "ucl_titles_badge", "ucl_respect", "club_world_cup", "ucl_final_print"] as const;
    expect(checkPatches([...cardiff], rm, "2016/17")).toBeNull();
    expect(patchPieces(cardiff, true)).toBe(5);
  });
  it("the titles badge only for clubs that have one", () => {
    expect(checkPatches(["ucl_titles_badge"], { id: "chelsea", type: "club", league_id: "premier-league" }, "2016/17")).toMatch(/titles badge/);
  });
  it("chest extras sit outside the 2 sleeve slots", () => {
    expect(checkPatches(["league", "champions_league", "club_world_cup"], rm, "2016/17")).toBeNull();
  });
  it("still only 2 sleeve patches", () => {
    expect(checkPatches(["league", "champions_league", "ucl_titles_badge"], rm, "2016/17")).toMatch(/2/);
  });
  it("only seasons the club held the title / finals we have a print for", () => {
    expect(checkPatches(["club_world_cup"], rm, "2020/21")).toMatch(/FIFA/);
    expect(checkPatches(["ucl_final_print"], rm, "2017/18")).toMatch(/final print/);
    expect(isClubWorldChampionSeason("chelsea", "2025/26")).toBe(true);
    expect(isClubWorldChampionSeason("paris-saint-germain", "2025/26")).toBe(true);
    expect(isClubWorldChampionSeason("arsenal", "2025/26")).toBe(false);
    expect(uclFinalPrint("real-madrid", "2016/17")?.words).toMatch(/CARDIFF/);
  });
});
