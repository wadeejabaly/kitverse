import { priceFor, seasonYear } from "@/data/pricing";
import type { Product } from "@/data/types";
import type { SortKey } from "@/lib/shop-href";

/**
 * Applies a listing sort (redesign phase 2). Stable: shirts that tie keep the
 * catalog's own order, so "newest" still reads as a curated list within a
 * season rather than a shuffle. Never mutates the input.
 */
export function sortProducts(products: Product[], sort: SortKey): Product[] {
  if (sort === "featured") return products;
  const indexed = products.map((product, index) => ({ product, index }));
  const from = (p: Product) => priceFor(p.season, "S", "fan");
  indexed.sort((a, b) => {
    let diff = 0;
    if (sort === "newest") diff = seasonYear(b.product.season) - seasonYear(a.product.season);
    else if (sort === "price-asc") diff = from(a.product) - from(b.product);
    else if (sort === "price-desc") diff = from(b.product) - from(a.product);
    return diff !== 0 && Number.isFinite(diff) ? diff : a.index - b.index;
  });
  return indexed.map((entry) => entry.product);
}
