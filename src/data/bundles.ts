import { getProduct } from "@/data/catalog";
import type { Product } from "@/data/types";

/**
 * Club bundles (owner request 2026-11-12): one club's three 2026/27 shirts - home, away, third - sold
 * together, each customised on its own (size, name + number, patches), with one optional gift box for
 * the whole bundle.
 *
 * Price: "still 110 per shirt" - every shirt is the player version at the price list's normal player
 * price (admin Pricing), so there is no separate bundle price to keep in sync: adding a bundle puts
 * three ordinary player-version lines in the cart and the gift box on the order, priced like any other
 * order by src/data/pricing.ts and re-priced on the server by the engine. Nothing here holds a price.
 *
 * `image` is the bundle's main picture - the owner's photo of the boxed shirts once he sends it
 * (public/bundles/<slug>.jpg); until then the page shows the three shirts' own photos.
 */
export interface Bundle {
  slug: string;
  /** Team slug, same as the /shop/<team> pages. */
  team: string;
  handles: [string, string, string];
  image?: string;
}

export const BUNDLE_VERSION = "player" as const;

export const BUNDLES: Bundle[] = [
  {
    slug: "real-madrid-2026-27",
    team: "real-madrid",
    handles: ["real-madrid-2026-27-home-shirt", "real-madrid-2026-27-away-shirt", "real-madrid-2026-27-third-shirt"],
    image: "/bundles/real-madrid-2026-27.jpg",
  },
  {
    slug: "barcelona-2026-27",
    team: "barcelona",
    handles: ["barcelona-2026-27-home-shirt", "barcelona-2026-27-away-shirt", "barcelona-2026-27-third-shirt"],
    image: "/bundles/barcelona-2026-27.jpg",
  },
  {
    slug: "manchester-united-2026-27",
    team: "manchester-united",
    handles: ["manchester-united-2026-27-home-shirt", "manchester-united-2026-27-away-shirt", "manchester-united-2026-27-third-shirt"],
    image: "/bundles/manchester-united-2026-27.jpg",
  },
  {
    slug: "manchester-city-2026-27",
    team: "manchester-city",
    handles: ["manchester-city-2026-27-home-shirt", "manchester-city-2026-27-away-shirt", "manchester-city-2026-27-third-shirt"],
    image: "/bundles/manchester-city-2026-27.jpg",
  },
];

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
