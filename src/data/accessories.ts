import accessoriesData from "./accessories.json";
import { slugify } from "./slug";
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
 * generic keychain), generated from every team already in
 * src/data/collections.json — national and club alike, the same set
 * src/data/catalog.ts's getTeams() reads. ₪14.99 flat (owner decision
 * 2026-10-25), a placeholder photo until real product photography exists
 * (the same public/products/_placeholder.jpg every photo-less jersey already
 * uses, so a keychain tile looks exactly like an unphotographed shirt tile
 * does today — a known, already-handled empty state, not a broken image).
 */

const accessories: Accessory[] = accessoriesData.accessories as Accessory[];

/** Every visible accessory, regardless of category. */
export function getVisibleAccessories(): Accessory[] {
  return accessories.filter((a) => a.visible);
}

/** Every visible accessory in one category (just "keychain" today). */
export function accessoriesByCategory(category: Accessory["category"]): Accessory[] {
  return getVisibleAccessories().filter((a) => a.category === category);
}

/** A single accessory by handle, visible or not — mirrors catalog.ts's getProduct(). */
export function getAccessory(handle: string): Accessory | undefined {
  return accessories.find((a) => a.handle === handle);
}

/** The team a keychain belongs to, matched by slugifying `accessory.team` — mirrors catalog.ts's byTeam(). */
export function keychainForTeam(teamSlug: string): Accessory | undefined {
  return accessoriesByCategory("keychain").find((a) => slugify(a.team) === teamSlug);
}
