import { describe, expect, it } from "vitest";
import { normalizeUsername, parseUsernames } from "./testers";

describe("tester usernames", () => {
  it("normalizes handles, links and case", () => {
    expect(normalizeUsername(" @Kit.Verse_1 ")).toBe("kit.verse_1");
    expect(normalizeUsername("https://www.instagram.com/someone/")).toBe("someone");
  });
  it("splits lines/commas, drops junk and duplicates", () => {
    expect(parseUsernames("@a_b\nA_B, c.d\n\nbad!name")).toEqual(["a_b", "c.d"]);
  });
});
