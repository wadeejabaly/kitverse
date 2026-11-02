import { describe, expect, it } from "vitest";
import { LOOKUP_FAILURE_TTL_MS, isCachedDenial, normalizeUsername, parseUsernames, withDenial } from "./testers";

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
  const usernames = ["omarhawari2", "wadijabaly"];
  const now = 1_000_000;

  it("skips a repeat sender who is not on the list", () => {
    const d = withDenial(usernames, null, "igsid1", false, now);
    expect(isCachedDenial(usernames, d, "igsid1", now + 86400_000)).toBe(true);
    expect(isCachedDenial(usernames, d, "someone-else", now)).toBe(false);
  });

  it("only trusts a failed username lookup for a short while", () => {
    const d = withDenial(usernames, null, "igsid1", true, now);
    expect(isCachedDenial(usernames, d, "igsid1", now + LOOKUP_FAILURE_TTL_MS - 1)).toBe(true);
    expect(isCachedDenial(usernames, d, "igsid1", now + LOOKUP_FAILURE_TTL_MS + 1)).toBe(false); // asked again
  });

  it("forgets every denial when the tester list changes", () => {
    const d = withDenial(["old", "list"], null, "igsid1", false, now);
    expect(isCachedDenial(usernames, d, "igsid1", now)).toBe(false);
    expect(Object.keys(withDenial(usernames, d, "igsid2", false, now).ids)).toEqual(["igsid2"]);
  });

  it("drops expired entries and treats an empty cache as no denials", () => {
    const d = withDenial(usernames, withDenial(usernames, null, "a", true, now), "b", false, now + LOOKUP_FAILURE_TTL_MS + 1);
    expect(Object.keys(d.ids)).toEqual(["b"]);
    expect(isCachedDenial(usernames, null, "a", now)).toBe(false);
  });
});
