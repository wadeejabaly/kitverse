import { describe, expect, it } from "vitest";
import { deniedIdsFingerprint, isCachedDenial, normalizeUsername, parseUsernames } from "./testers";

describe("tester usernames", () => {
  it("normalizes handles, links and case", () => {
    expect(normalizeUsername(" @Kit.Verse_1 ")).toBe("kit.verse_1");
    expect(normalizeUsername("https://www.instagram.com/someone/")).toBe("someone");
  });
  it("splits lines/commas, drops junk and duplicates", () => {
    expect(parseUsernames("@a_b\nA_B, c.d\n\nbad!name")).toEqual(["a_b", "c.d"]);
  });
});

describe("denied-sender cache", () => {
  const usernames = ["kit.verse_1", "someone"];

  it("skips a repeat sender denied under the same tester list", () => {
    const s = { usernames, denied_ids: ["igsid1"], denied_ids_for: deniedIdsFingerprint(usernames) };
    expect(isCachedDenial(s, "igsid1")).toBe(true);
    expect(isCachedDenial(s, "someone-else")).toBe(false); // never denied
  });

  it("goes stale the moment the owner edits the tester list (owner report 2026-11-02)", () => {
    const s = { usernames, denied_ids: ["igsid1"], denied_ids_for: deniedIdsFingerprint(["old", "list"]) };
    expect(isCachedDenial(s, "igsid1")).toBe(false); // re-check, don't trust yesterday's list
  });

  it("has nothing cached yet is never a false allow", () => {
    expect(isCachedDenial({ usernames, denied_ids: undefined, denied_ids_for: undefined }, "igsid1")).toBe(false);
  });
});
