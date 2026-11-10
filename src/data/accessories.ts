import accessoriesData from "./accessories.json";
import { slugify } from "./slug";
import { accessoryListPrice } from "./pricing";
import type { Accessory } from "./types";

/**
 * Typed accessors for src/data/accessories.json — the Accessories category's
 * own small catalog (2026-10-25, "add an Accessories category, keychains for
 * now"). Deliberately separate from catalog.ts/catalog.json: those are
 * regenerated from the database on every build
 * (scripts/export-store-catalog.ts, run as the `prebuild` script), which
 * would silently wipe anything added here by hand. accessories.json is
 * hand-maintained until the database grows a real accessories table — see
 * supabase/migrations/ for the prepared (not yet applied) schema and
 * scripts/seed-accessories.ts for the prepared seed script.
 *
 * One keychain per team (2026-10-25, the owner's choice over a single
 * generic keychain), originally generated for every team in
 * src/data/collections.json (national and club alike — the same set
 * src/data/catalog.ts's getTeams() reads) with a placeholder photo. Owner
 * decision 2026-10-26: cut the list down to only the teams with a real
 * product photo (19, including Al Nassr — not a jersey-catalog team, added
 * for this category only) rather than ship 96 placeholder tiles; the rest
 * can be added back once photographed. ₪18 flat (owner decision 2026-10-25,
 * raised from the original ₪14.99 on 2026-11-02).
 */

// Owner request 2026-11-10 (accessories really sold online): the price is the price list's add-on
// for the category ('keychain', 'scarf' - edited in admin Pricing), the same number the server
// charges; the JSON's own `price` is only a fallback for a category the price list doesn't have.
const accessories: Accessory[] = (accessoriesData.accessories as Accessory[]).map((a) => ({ ...a, price: accessoryListPrice(a.category) ?? a.price }));

/** Every visible accessory, regardless of category. */
export function getVisibleAccessories(): Accessory[] {
  return accessories.filter((a) => a.visible);
}

/** In stock unless explicitly marked `inStock: false` (owner request 2026-11-10: out-of-stock items stay on the site). */
export function isInStock(a: Pick<Accessory, "inStock">): boolean {
  return a.inStock !== false;
}

/** Visible AND in stock - the only accessories the cart, checkout and server will take. */
export function getOrderableAccessories(): Accessory[] {
  return getVisibleAccessories().filter(isInStock);
}

/** Every visible accessory in one category ("keychain" or "scarf"). */
export function accessoriesByCategory(category: Accessory["category"]): Accessory[] {
  // in-stock first (stable), so out-of-stock designs sit at the end of the grid
  const list = getVisibleAccessories().filter((a) => a.category === category);
  return [...list.filter(isInStock), ...list.filter((a) => !isInStock(a))];
}

/** A single accessory by handle, visible or not — mirrors catalog.ts's getProduct(). */
export function getAccessory(handle: string): Accessory | undefined {
  return accessories.find((a) => a.handle === handle);
}

/** The team a keychain belongs to, matched by slugifying `accessory.team` — mirrors catalog.ts's byTeam(). */
export function keychainForTeam(teamSlug: string): Accessory | undefined {
  return accessoriesByCategory("keychain").find((a) => slugify(a.team) === teamSlug);
}

/** The page an accessory lives on: keychains by team slug, scarves by their own handle (a team has several). */
export function accessoryHref(a: { category: string; handle: string; team: string }): string {
  return a.category === "scarf" ? `/accessories/scarves/${a.handle}` : `/accessories/keychains/${slugify(a.team)}`;
}

/** Team name in the visitor's language. */
export function accessoryTeam(a: { team: string; teamAr: string; teamHe?: string }, locale: string): string {
  return locale === "ar" ? a.teamAr : locale === "he" && a.teamHe ? a.teamHe : a.team;
}

/** The design name in the visitor's language (scarves), or null. */
export function accessoryVariant(a: { variant?: string; variantAr?: string; variantHe?: string }, locale: string): string | null {
  return (locale === "ar" ? a.variantAr : locale === "he" ? a.variantHe : a.variant) ?? a.variant ?? null;
}
