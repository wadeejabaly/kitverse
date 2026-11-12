import type { Product } from "@/data/types";

/** The bundle's club name in the reader's language (Hebrew included). */
export function bundleTeam(product: Product, locale: string): string {
  return locale === "ar" ? product.teamAr : locale === "he" ? product.teamHe || product.team : product.team;
}
