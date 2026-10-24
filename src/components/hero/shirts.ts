import { getProduct, getVisibleProducts } from "@/data/catalog";
import type { Product } from "@/data/types";

/**
 * Shirt selection for the hero variants.
 *
 * A hero is art-directed: which shirt opens the site is a design decision, not
 * whatever happens to sort first. But the catalog is gated on image review, so
 * any named handle can vanish from the storefront between now and launch —
 * which is why every pick here NAMES its preference and then falls back to the
 * approved set rather than rendering an empty tile.
 */

/**
 * The named shirts, in order of preference, topped up from the approved set if
 * any of them is not (or is no longer) visible.
 */
export function pickShirts(preferred: readonly string[], count: number): Product[] {
  const chosen: Product[] = [];
  const seen = new Set<string>();

  const take = (product: Product | undefined) => {
    if (!product || !product.visible || seen.has(product.handle)) return;
    seen.add(product.handle);
    chosen.push(product);
  };

  for (const handle of preferred) {
    take(getProduct(handle));
    if (chosen.length === count) return chosen;
  }

  for (const product of getVisibleProducts()) {
    take(product);
    if (chosen.length === count) break;
  }

  return chosen;
}

/**
 * An evenly spread sample of the approved set.
 *
 * The wall in Variant B is an argument about BREADTH, and the catalog is
 * ordered by handle — so the first N products are eleven shades of the same
 * three clubs and would make exactly the wrong argument. Walking the list in
 * even strides instead gives a row that reads as "a lot of different teams",
 * which is the point of the section. `offset` staggers the second row off the
 * first so no shirt appears twice on screen.
 */
export function spreadShirts(count: number, offset = 0): Product[] {
  const all = getVisibleProducts();
  if (all.length === 0) return [];

  const stride = all.length / count;
  const picked: Product[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(all[Math.floor(i * stride + offset) % all.length]);
  }
  return picked;
}
