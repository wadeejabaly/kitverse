import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { patchesText, sheetLang, shirtTitleZh, versionText } from "./supplier-sheet";

describe("supplier sheet in Chinese (owner 2026-11-17)", () => {
  it("reads the language switch", () => {
    expect(sheetLang("zh")).toBe("zh");
    expect(sheetLang(null)).toBe("en");
  });
  it("translates version, sleeve and kits", () => {
    expect(versionText({ version: "Player", sleeve: "Long", audience: "adult" }, "zh")).toBe("球员版 长袖");
    expect(versionText({ version: "Fan", sleeve: "Short", audience: "kids" }, "zh")).toBe("球迷版 童装套装（上衣+短裤）");
    expect(versionText({ version: "Fan", sleeve: "Short", audience: "adult" })).toBe("Fan");
  });
  it("translates patches and the gift box", () => {
    expect(patchesText({ patch_ids: ["league", "champions_league"], league_id: "la-liga", box: "yes" }, "zh")).toBe("西甲臂章 + 欧冠臂章 + 礼盒");
    expect(patchesText({ patch_ids: ["league"], league_id: "la-liga", box: "" })).toBe("La Liga patch");
  });
  it("names the shirt in Chinese", () => {
    expect(shirtTitleZh({ team: "Barcelona", season: "2026/27", kit: "Away", title: "x", full_kit: false })).toBe("巴塞罗那 2026/27 客场球衣");
    expect(shirtTitleZh({ team: "Real Madrid", season: "2026/27", kit: "Home", title: "x", full_kit: true })).toBe("皇家马德里 2026/27 主场套装");
    expect(shirtTitleZh({ team: "", season: "", kit: "", title: "Odd shirt", full_kit: false })).toBe("Odd shirt");
  });
});
