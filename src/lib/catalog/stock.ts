/**
 * Shirt stock (owner request 2026-11-12, "make ajax 2019 shirt out of stock"): a shirt whose
 * products.flags contains this value stays on the website marked "Out of stock" (catalog.json
 * `inStock: false`, written by scripts/export-store-catalog.ts), and is refused by the web checkout
 * (src/lib/orders/web.ts) and by the bot's draft order (src/lib/orders/draft.ts). Removing the flag
 * (and the next deploy, for the website) puts it back on sale. No schema change - flags is free text.
 */
export const OUT_OF_STOCK_FLAG = "out_of_stock";

export function isOutOfStock(flags: readonly string[] | null | undefined): boolean {
  return !!flags?.includes(OUT_OF_STOCK_FLAG);
}
