import { describe, expect, it } from "vitest";
import { patchOptionsFor } from "@/data/patches";
import { checkPatches } from "@/lib/orders/rules";

const ids = (team: string, season: string) => patchOptionsFor({ league: "la-liga", kind: "current", team, season }).map((o) => o.id);

describe("current-shirt Champions League patches (owner request 2026-11-12)", () => {
  it("Real Madrid 2026/27: La Liga, the titles badge and Europa only", () => {
    expect(ids("Real Madrid", "2026/27")).toEqual(["league", "ucl_titles_badge", "europa_league"]);
  });
  it("a club with no titles badge keeps the plain ball, no Respect", () => {
    const o = ids("Atletico Madrid", "2026/27");
    expect(o).toContain("champions_league");
    expect(o).not.toContain("ucl_respect");
  });
  it("retro shirts keep every option", () => {
    const o = ids("Real Madrid", "2016/17");
    expect(o).toEqual(expect.arrayContaining(["champions_league", "ucl_titles_badge", "ucl_respect"]));
  });
  it("the bot refuses the same", () => {
    const rm = { id: "real-madrid", type: "club" as const, league_id: "la-liga" };
    expect(checkPatches(["champions_league"], rm, "2026/27")).toBeTruthy();
    expect(checkPatches(["ucl_titles_badge"], rm, "2026/27")).toBeNull();
    expect(checkPatches(["champions_league"], rm, "2016/17")).toBeNull();
  });
});

describe("La Liga one-patch shirts + Champions League (owner 2026-11-21)", () => {
  it("toggling keeps the La Liga patch next to a Champions League patch, and swaps within each kind", async () => {
    const { togglePatchIn } = await import("./patch-limits");
    let p: string[] = togglePatchIn([], "league", 1);
    p = togglePatchIn(p, "ucl_titles_badge", 1);
    expect(p.sort()).toEqual(["league", "ucl_titles_badge"]);
    p = togglePatchIn(p, "europa_league", 1); // another non-UCL patch swaps the league one
    expect(p.sort()).toEqual(["europa_league", "ucl_titles_badge"]);
    p = togglePatchIn(p, "champions_league", 1); // another UCL piece swaps the UCL one
    expect(p.sort()).toEqual(["champions_league", "europa_league"]);
  });
  it("the bot check accepts league + titles badge on a La Liga 2026/27 shirt, refuses two non-UCL", async () => {
    const { checkPatches } = await import("./orders/rules");
    const team = { id: "real-madrid", type: "club" as const, league_id: "la-liga" };
    expect(checkPatches(["league", "ucl_titles_badge"] as never, team as never, "2026/27")).toBeNull();
    expect(checkPatches(["league", "europa_league"] as never, team as never, "2026/27")).not.toBeNull();
  });
});
