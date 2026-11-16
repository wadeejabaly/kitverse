import { describe, expect, it } from "vitest";
import { PHONE_MODELS, isPhoneModel, needsPhoneModel } from "./phone-models";
import { getAccessory, accessoryHref } from "./accessories";
import { accessoryListPrice } from "./pricing";

describe("phone cases (owner 2026-11-16)", () => {
  it("offers the supplier's iPhone and Galaxy models, no duplicates", () => {
    expect(PHONE_MODELS).toContain("iPhone 17 Pro Max");
    expect(PHONE_MODELS).toContain("Galaxy A16");
    expect(new Set(PHONE_MODELS).size).toBe(PHONE_MODELS.length);
  });
  it("each case only takes its own supplier's phones", () => {
    expect(isPhoneModel("Galaxy A16", "messi")).toBe(true);
    expect(isPhoneModel("Galaxy A16", "real-madrid")).toBe(false);
    expect(isPhoneModel("iPhone 11", "real-madrid")).toBe(false);
    expect(isPhoneModel("iPhone 13 mini", "real-madrid")).toBe(true);
    expect(isPhoneModel("iPhone 17 Air", "barcelona")).toBe(false);
    expect(isPhoneModel("iPhone 11", "barcelona")).toBe(true);
    expect(isPhoneModel("iPhone 13 mini", "messi")).toBe(false);
    expect(getAccessory("phone-case-real-madrid-stripes")?.phoneModels).toBe("real-madrid");
    expect(getAccessory("phone-case-barcelona-crest-green")?.phoneModels).toBe("barcelona");
  });
  it("only accepts listed models", () => {
    expect(isPhoneModel("iPhone 15")).toBe(true);
    expect(isPhoneModel("Nokia 3310")).toBe(false);
    expect(isPhoneModel(undefined)).toBe(false);
  });
  it("cases need a model, other accessories don't", () => {
    expect(needsPhoneModel("phone_case")).toBe(true);
    expect(needsPhoneModel("scarf")).toBe(false);
  });
  it("cases are priced from the price list (45) and live on their own pages", () => {
    const a = getAccessory("phone-case-messi-10-black")!;
    expect(a.category).toBe("phone_case");
    expect(accessoryListPrice("phone_case")).toBe(45);
    expect(a.price).toBe(45);
    expect(accessoryHref(a)).toBe("/accessories/phone-cases/phone-case-messi-10-black");
  });
});
