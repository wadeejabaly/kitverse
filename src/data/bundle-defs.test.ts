import { describe, expect, it } from "vitest";
import { completeBundles } from "./bundle-defs";

const acc = (h: string) =>
  ({ "keychain-real-madrid": { team: "real-madrid", category: "keychain" }, "scarf-real-madrid-blue-black": { team: "real-madrid", category: "scarf" }, "keychain-barcelona": { team: "barcelona", category: "keychain" } })[h];
const RM = ["real-madrid-2026-27-home-shirt", "real-madrid-2026-27-away-shirt", "real-madrid-2026-27-third-shirt"];

describe("completeBundles (owner request 2026-11-15)", () => {
  it("a club bundle needs all three shirts, player version, same quantity", () => {
    const all = RM.map((handle) => ({ handle, version: "player", qty: 1, bundle: "real-madrid-2026-27" }));
    expect(completeBundles(all, [], acc).has("real-madrid-2026-27")).toBe(true);
    expect(completeBundles(all.slice(0, 2), [], acc).size).toBe(0);
    expect(completeBundles([{ ...all[0], version: "fan" }, all[1], all[2]], [], acc).size).toBe(0);
    expect(completeBundles([{ ...all[0], qty: 2 }, all[1], all[2]], [], acc).size).toBe(0);
  });
  it("a fan bundle needs shirt + team keychain + team scarf in equal numbers", () => {
    const shirt = { handle: RM[1], version: "player", qty: 1, bundle: "fan-real-madrid" };
    const key = { handle: "keychain-real-madrid", qty: 1, bundle: "fan-real-madrid" };
    const scarf = { handle: "scarf-real-madrid-blue-black", qty: 1, bundle: "fan-real-madrid" };
    expect(completeBundles([shirt], [key, scarf], acc).has("fan-real-madrid")).toBe(true);
    expect(completeBundles([shirt], [key], acc).size).toBe(0);
    expect(completeBundles([], [key, scarf], acc).size).toBe(0);
    expect(completeBundles([shirt], [{ ...key, handle: "keychain-barcelona" }, scarf], acc).size).toBe(0);
    expect(completeBundles([{ ...shirt, qty: 2 }], [key, scarf], acc).size).toBe(0);
    expect(completeBundles([{ ...shirt, handle: "barcelona-2026-27-home-shirt" }], [key, scarf], acc).size).toBe(0);
    expect(completeBundles([{ ...shirt, version: "fan" }], [key, scarf], acc).size).toBe(0); // player only (owner 2026-11-17)
  });
  it("unknown slugs are never complete", () => {
    expect(completeBundles([{ handle: RM[0], version: "player", qty: 1, bundle: "nope" }], [], acc).size).toBe(0);
  });
});

describe("build your own bundle (owner request 2026-11-17)", () => {
  const none = () => undefined;
  const shirt = (handle: string, bundle: string, qty = 1, version = "player") => ({ handle, version, qty, bundle });
  it("any 3 shirts from any teams, fan or player, make a complete bundle", () => {
    const items = [shirt("barcelona-2026-27-home-shirt", "custom-abc12345"), shirt("arsenal-2026-27-away-shirt", "custom-abc12345", 1, "player"), shirt("napoli-2026-27-home-shirt", "custom-abc12345")];
    expect(completeBundles(items, [], none).has("custom-abc12345")).toBe(true);
  });
  it("2 or 4 shirts are not a bundle", () => {
    expect(completeBundles([shirt("a", "custom-abc12345"), shirt("b", "custom-abc12345")], [], none).size).toBe(0);
    expect(completeBundles([shirt("a", "custom-abc12345", 2), shirt("b", "custom-abc12345", 2)], [], none).size).toBe(0);
  });
  it("the same shirt twice + one more counts (3 shirts)", () => {
    expect(completeBundles([shirt("a", "custom-abc12345", 2), shirt("b", "custom-abc12345")], [], none).has("custom-abc12345")).toBe(true);
  });
  it("the server refuses a shirt that may not be in one (retro / kit)", () => {
    const items = [shirt("a", "custom-abc12345"), shirt("b", "custom-abc12345"), shirt("retro", "custom-abc12345")];
    expect(completeBundles(items, [], none, (h) => h !== "retro").size).toBe(0);
  });
  it("two custom bundles on one order are counted separately", () => {
    const items = [shirt("a", "custom-aaaa1111"), shirt("b", "custom-aaaa1111"), shirt("c", "custom-aaaa1111"), shirt("d", "custom-bbbb2222"), shirt("e", "custom-bbbb2222")];
    const ok = completeBundles(items, [], none);
    expect(ok.has("custom-aaaa1111")).toBe(true);
    expect(ok.has("custom-bbbb2222")).toBe(false);
  });
  it("fan shirts never make a bundle - bundles are player only (owner 2026-11-17)", () => {
    const items = [shirt("a", "custom-abc12345"), shirt("b", "custom-abc12345"), shirt("c", "custom-abc12345", 1, "fan")];
    expect(completeBundles(items, [], none).size).toBe(0);
  });
});
