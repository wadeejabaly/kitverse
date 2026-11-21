import { describe, expect, it } from "vitest";
import { sanitizeNameNumber } from "./product";

describe("sanitizeNameNumber", () => {
  it("keeps a dot in the name (owner request 2026-11-21)", () => {
    expect(sanitizeNameNumber("r. carlos 3")).toBe("R. CARLOS 3");
    expect(sanitizeNameNumber("De.Jong 21")).toBe("DE.JONG 21");
  });
  it("collapses repeated dots and spaces, drops other symbols", () => {
    expect(sanitizeNameNumber("R...  CARLOS!! 3")).toBe("R. CARLOS 3");
  });
});
