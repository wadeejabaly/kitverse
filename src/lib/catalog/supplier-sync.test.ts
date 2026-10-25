import { describe, it, expect } from "vitest";
import { parseAlbumTitle } from "./supplier-sync";

describe("supplier album titles", () => {
  it("parses the supplier's formats", () => {
    expect(parseAlbumTitle("26-27 Barc Away Player Version Cheap Soccer Jerseys Yupoo")).toMatchObject({ season: "2026/27", kit: "Away", version: "player", teamRaw: "Barc", isShirt: true, era: "current" });
    expect(parseAlbumTitle("2008-09 M-anchester U-nited Away Retro Long Sleeve Soccer Jerseys Yupoo")).toMatchObject({ season: "2008/09", era: "retro", sleeve: "long", teamRaw: "Manchester United" });
    expect(parseAlbumTitle("Mens Morocco 2026 World Cup Home Jersey")).toMatchObject({ season: "2026", kit: "Home", teamRaw: "Morocco" });
    expect(parseAlbumTitle("26-27 AlNassr Home Kids Cheap Soccer Jerseys and shorts Yupoo")).toMatchObject({ audience: "kids", isShirt: true });
    expect(parseAlbumTitle("25/26 Chelsea Home S-4XL")).toMatchObject({ kit: "Home", isShirt: true });
  });
  it("skips non-shirts", () => {
    expect(parseAlbumTitle("25-26 Bayern Training Soccer Suit Yupoo").isShirt).toBe(false);
    expect(parseAlbumTitle("26-27 Inter Miami Baby Cheap Soccer Jerseys Yupoo").isShirt).toBe(false);
    expect(parseAlbumTitle("25-26 Bayern Windbreaker Jackets Yupoo").isShirt).toBe(false);
  });
});

describe("label cutting", () => {
  it("trims a top-left label above the shoulders, keeps the shirt", async () => {
    const { planCut } = await import("./photo-qa");
    const shirt = { x: 0.08, y: 0.1, w: 0.84, h: 0.85 };
    const cut = planCut(shirt, [{ x: 0.0, y: 0.0, w: 0.45, h: 0.07 }]);
    expect(cut).not.toBeNull();
    expect(cut!.y).toBeGreaterThan(0.07);
  });
  it("refuses when the label sits on the shirt", async () => {
    const { planCut } = await import("./photo-qa");
    expect(planCut({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, [{ x: 0.4, y: 0.45, w: 0.2, h: 0.1 }])).toBeNull();
  });
});

describe("album photos", () => {
  it("keeps only the album's own photos", async () => {
    const { parseAlbumPhotos } = await import("./images");
    const html = `<meta property="og:image" content="https://photo.yupoo.com/jerseyxie/aaaa1111/medium.jpeg">
      <img data-src="https://photo.yupoo.com/jerseyxie/bbbb2222/big.jpeg" data-album-id="42" data-path="/jerseyxie/bbbb2222/x.jpeg">
      <img data-path="/jerseyxie/cccc3333/y.jpeg" data-album-id="42">
      <img data-album-id="99" data-path="/jerseyxie/dddd4444/z.jpeg">`;
    expect(parseAlbumPhotos(html, "42")).toEqual(["bbbb2222", "cccc3333"]);
  });
});
