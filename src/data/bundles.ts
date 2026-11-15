import { getProduct } from "@/data/catalog";
import { getAccessory, getOrderableAccessories } from "@/data/accessories";
import type { Accessory, Product } from "@/data/types";
import { slugify } from "@/data/slug";
import { BUNDLES, BUNDLE_VERSION, FAN_BUNDLES, completeBundles as completeWith, type Bundle, type FanBundle } from "@/data/bundle-defs";

export { BUNDLES, BUNDLE_VERSION, FAN_BUNDLES, type Bundle, type FanBundle };

/**
 * Club bundles (owner request 2026-11-12): one club's three 2026/27 shirts - home, away, third - sold
 * together, each customised on its own (size, name + number, patches), with one optional gift box for
 * the whole bundle.
 *
 * Price: the player version at the price list's BUNDLE price (owner request 2026-11-15: "keep them as
 * 330" when the normal player price went to 115) - admin Pricing groups `bundle_player` 110 /
 * `bundle_player_long` 120. Adding a bundle puts three player-version lines tagged with the bundle's
 * slug in the cart; the server only gives them the bundle price when all three are on the order
 * (completeBundles in ./bundle-defs.ts). Nothing here holds a price.
 *
 * `image` is the bundle's main picture - the owner's photo of the boxed shirts once he sends it
 * (public/bundles/<slug>.jpg); until then the page shows the three shirts' own photos.
 */
/** A bundle with its three shirts, or null when any of them is off the site or out of stock - a bundle is all three or nothing. */
export function bundleWithProducts(slug: string): { bundle: Bundle; products: Product[] } | null {
  const bundle = BUNDLES.find((b) => b.slug === slug);
  if (!bundle) return null;
  const products = bundle.handles.map((h) => getProduct(h));
  if (products.some((p) => !p || !p.visible || p.inStock === false)) return null;
  return { bundle, products: products as Product[] };
}

export function availableBundles() {
  return BUNDLES.map((b) => bundleWithProducts(b.slug)).filter((b): b is NonNullable<typeof b> => !!b);
}

/** A fan bundle with what it can be made of right now, or null when it can't be bought (no shirt, keychain or scarf). */
export function fanBundleWithProducts(slug: string): { bundle: FanBundle; shirts: Product[]; keychain: Accessory; scarves: Accessory[] } | null {
  const bundle = FAN_BUNDLES.find((b) => b.slug === slug);
  const club = bundle && BUNDLES.find((b) => b.slug === bundle.club);
  if (!bundle || !club) return null;
  const shirts = club.handles.map((h) => getProduct(h)).filter((p): p is Product => !!p && p.visible && p.inStock !== false);
  const keychain = getOrderableAccessories().find((a) => a.category === "keychain" && slugify(a.team) === bundle.team);
  const scarves = getOrderableAccessories().filter((a) => a.category === "scarf" && slugify(a.team) === bundle.team);
  if (!shirts.length || !keychain || !scarves.length) return null;
  return { bundle, shirts, keychain, scarves };
}

export function availableFanBundles() {
  return FAN_BUNDLES.map((b) => fanBundleWithProducts(b.slug)).filter((b): b is NonNullable<typeof b> => !!b);
}

/** The server's check: accessory team/category from the accessories file. */
export function completeBundles(
  items: { handle: string; version: string; qty: number; bundle?: string | null }[],
  accessories: { handle: string; qty: number; bundle?: string | null }[],
): Set<string> {
  return completeWith(items, accessories, (handle) => {
    const a = getAccessory(handle);
    return a ? { team: slugify(a.team), category: a.category } : undefined;
  });
}
