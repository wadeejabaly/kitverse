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
    const shirt = { handle: RM[1], version: "fan", qty: 1, bundle: "fan-real-madrid" };
    const key = { handle: "keychain-real-madrid", qty: 1, bundle: "fan-real-madrid" };
    const scarf = { handle: "scarf-real-madrid-blue-black", qty: 1, bundle: "fan-real-madrid" };
    expect(completeBundles([shirt], [key, scarf], acc).has("fan-real-madrid")).toBe(true);
    expect(completeBundles([shirt], [key], acc).size).toBe(0);
    expect(completeBundles([], [key, scarf], acc).size).toBe(0);
    expect(completeBundles([shirt], [{ ...key, handle: "keychain-barcelona" }, scarf], acc).size).toBe(0);
    expect(completeBundles([{ ...shirt, qty: 2 }], [key, scarf], acc).size).toBe(0);
    expect(completeBundles([{ ...shirt, handle: "barcelona-2026-27-home-shirt" }], [key, scarf], acc).size).toBe(0);
  });
  it("unknown slugs are never complete", () => {
    expect(completeBundles([{ handle: RM[0], version: "player", qty: 1, bundle: "nope" }], [], acc).size).toBe(0);
  });
});
