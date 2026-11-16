/**
 * The phone models a phone case can be ordered for (owner requests 2026-11-16) - the supplier's own lists,
 * from the owner's screenshots. Each case design comes from a supplier listing with its own list of phones,
 * so an accessory names its list (`phoneModels` in accessories.json). Browser-safe: the case page's picker,
 * the cart and the server (src/lib/orders/web.ts) all check a line's model against the case's own list.
 */
export type PhoneModelSet = "messi" | "real-madrid" | "barcelona";
export type PhoneModelGroup = { brand: "iPhone" | "Galaxy"; models: string[] };

/** Every iPhone any supplier listing offers, newest first (display order). */
const IPHONES = [
  "iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17 Air", "iPhone 17",
  "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16", "iPhone 16e",
  "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
  "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
  "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13", "iPhone 13 mini",
  "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12", "iPhone 12 mini",
  "iPhone 11 Pro Max", "iPhone 11 Pro", "iPhone 11",
];

const GALAXY = [
  "Galaxy A37 5G", "Galaxy A36 5G", "Galaxy A35 5G", "Galaxy A34 5G", "Galaxy A33 5G", "Galaxy A32 4G",
  "Galaxy A26", "Galaxy A24 4G", "Galaxy A23", "Galaxy A17", "Galaxy A16", "Galaxy A15", "Galaxy A14",
  "Galaxy A13 5G", "Galaxy A13 4G", "Galaxy A12", "Galaxy A07", "Galaxy A06", "Galaxy A05s",
  "Galaxy M56 / F56 5G", "Galaxy M55 5G", "Galaxy M54 5G", "Galaxy M36 5G", "Galaxy M35 5G", "Galaxy M16 / F16 5G",
  "Galaxy Note 20 Ultra", "Galaxy Note 20",
];

const without = (...out: string[]) => IPHONES.filter((m) => !out.includes(m));

export const PHONE_MODEL_SETS: Record<PhoneModelSet, PhoneModelGroup[]> = {
  // Messi cases: iPhone 11-17 (no minis) + the Galaxy list
  messi: [{ brand: "iPhone", models: without("iPhone 13 mini") }, { brand: "Galaxy", models: GALAXY }],
  // Real Madrid cases: iPhone 12-17 only
  "real-madrid": [{ brand: "iPhone", models: IPHONES.filter((m) => !m.startsWith("iPhone 11")) }],
  // Barcelona cases: iPhone 11-17, no 17 Air
  barcelona: [{ brand: "iPhone", models: without("iPhone 17 Air") }],
};

export function phoneModelGroups(set: string | undefined): PhoneModelGroup[] {
  return PHONE_MODEL_SETS[set as PhoneModelSet] ?? [];
}

/** Every model any case can be ordered for (cart sanity check before the case is known). */
export const PHONE_MODELS: string[] = [...IPHONES, ...GALAXY];

export function isPhoneModel(model: unknown, set?: string): model is string {
  if (typeof model !== "string") return false;
  return set ? phoneModelGroups(set).some((g) => g.models.includes(model)) : PHONE_MODELS.includes(model);
}

/** Accessory categories that need a phone model on the line. */
export function needsPhoneModel(category: string | undefined): boolean {
  return category === "phone_case";
}
