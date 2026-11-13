import { describe, expect, it } from "vitest";
import { pickAccessories } from "./accessory-picks";

const acc = (handle: string, category: "scarf" | "keychain", team: string) => ({ handle, category, team });
const ALL = [
  acc("barca-key", "keychain", "Barcelona"),
  acc("barca-scarf-1", "scarf", "Barcelona"),
  acc("barca-scarf-2", "scarf", "Barcelona"),
  acc("rm-key", "keychain", "Real Madrid"),
  acc("rm-scarf", "scarf", "Real Madrid"),
  acc("liv-key", "keychain", "Liverpool"),
  acc("liv-scarf", "scarf", "Liverpool"),
  acc("arg-key", "keychain", "Argentina"),
];
const handles = (xs: { handle: string }[]) => xs.map((x) => x.handle);

describe("pickAccessories", () => {
  it("one team: its first scarf and its keychain", () => {
    expect(handles(pickAccessories([{ team: "Barcelona", qty: 2 }], ALL, []))).toEqual(["barca-scarf-1", "barca-key"]);
  });
  it("mixed teams: every team gets a pick first, most shirts first", () => {
    const shirts = [{ team: "Real Madrid", qty: 1 }, { team: "Barcelona", qty: 2 }];
    expect(handles(pickAccessories(shirts, ALL, []))).toEqual(["barca-scarf-1", "rm-scarf", "barca-key", "rm-key"]);
  });
  it("ties keep cart order and the list is capped", () => {
    const shirts = [{ team: "Liverpool", qty: 1 }, { team: "Real Madrid", qty: 1 }, { team: "Barcelona", qty: 1 }];
    expect(handles(pickAccessories(shirts, ALL, [], 4))).toEqual(["liv-scarf", "rm-scarf", "barca-scarf-1", "liv-key"]);
  });
  it("skips a category the shopper already has for that team", () => {
    const got = pickAccessories([{ team: "Barcelona", qty: 1 }], ALL, [{ team: "Barcelona", category: "scarf" }]);
    expect(handles(got)).toEqual(["barca-key"]);
  });
  it("a team with only a keychain, and teams with nothing", () => {
    expect(handles(pickAccessories([{ team: "Argentina", qty: 1 }, { team: "Ajax", qty: 3 }], ALL, []))).toEqual(["arg-key"]);
    expect(pickAccessories([{ qty: 1 }], ALL, [])).toEqual([]);
  });
});
