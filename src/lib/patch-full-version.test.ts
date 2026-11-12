import { describe, expect, it } from "vitest";
import { patchPieces } from "@/lib/patch-limits";
import { checkPatches } from "@/lib/orders/rules";

// owner decision 2026-11-12: Champions League full match version
describe("Champions League full version", () => {
  it("is charged as 3 patches on retro, 2 on current", () => {
    expect(patchPieces(["champions_league_full"], true)).toBe(3);
    expect(patchPieces(["champions_league_full"], false)).toBe(2);
    expect(patchPieces(["league", "champions_league"], true)).toBe(2);
    expect(patchPieces([], false)).toBe(0);
  });
  it("goes on the shirt alone and only on club shirts", () => {
    const club = { type: "club" as const, league_id: "eredivisie" };
    expect(checkPatches(["champions_league_full"], club, "2019/20")).toBeNull();
    expect(checkPatches(["champions_league_full", "europa_league"], club, "2019/20")).not.toBeNull();
    expect(checkPatches(["champions_league_full"], { type: "national", league_id: null }, "2026")).not.toBeNull();
    // a one-patch La Liga shirt can still take it (it is one choice)
    expect(checkPatches(["champions_league_full"], { type: "club", league_id: "la-liga" }, "2026/27")).toBeNull();
  });
});
