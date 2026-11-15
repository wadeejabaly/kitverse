import { describe, expect, it } from "vitest";
import { phoneLocale } from "./phone-locale";

describe("phoneLocale (owner 2026-11-16: language by the visitor's phone)", () => {
  it("Arabic phone -> Arabic", () => expect(phoneLocale("ar-IL,ar;q=0.9,en;q=0.8")).toBe("ar"));
  it("English phone -> English", () => expect(phoneLocale("en-US,en;q=0.9")).toBe("en"));
  it("Hebrew phone -> Hebrew", () => expect(phoneLocale("he-IL,he;q=0.9,en-US;q=0.8")).toBe("he"));
  it("any other language -> Hebrew", () => expect(phoneLocale("ru-RU,ru;q=0.9")).toBe("he"));
  it("no header -> Hebrew", () => expect(phoneLocale(null)).toBe("he"));
  it("respects q order", () => expect(phoneLocale("en;q=0.5,ar;q=0.9")).toBe("ar"));
});
