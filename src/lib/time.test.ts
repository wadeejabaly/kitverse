import { describe, expect, it } from "vitest";
import { israelDayEnd, israelDayStart } from "./time";

describe("Israel day boundaries", () => {
  it("summer time (+3)", () => {
    expect(israelDayStart(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07-09T21:00:00.000Z");
    expect(israelDayEnd(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07-10T20:59:59.999Z");
  });
  it("winter time (+2)", () => {
    expect(israelDayStart(new Date("2026-12-01T12:00:00Z"))).toBe("2026-11-30T22:00:00.000Z");
  });
  it("the day the clocks go back (25 Oct 2026): midnight was still summer time", () => {
    expect(israelDayStart(new Date("2026-10-25T15:00:00Z"))).toBe("2026-10-24T21:00:00.000Z");
    expect(israelDayEnd(new Date("2026-10-25T15:00:00Z"))).toBe("2026-10-25T21:59:59.999Z");
  });
  it("just after midnight Israel time counts as the new day", () => {
    expect(israelDayStart(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-01T22:00:00.000Z");
  });
});
