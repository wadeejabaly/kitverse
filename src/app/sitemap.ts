import type { MetadataRoute } from "next";
import { routing } from "@/i18n/config";
import { getVisibleProducts } from "@/data/catalog";
import { collectionParams } from "@/lib/collections";
import { localeUrl } from "@/lib/site";

/**
 * Sitemap — every URL derives from getSiteUrl() via localeUrl(), never a
 * literal, and every entry carries hreflang alternates for both locales.
 *
 * /search and /cart are deliberately absent: both are marked noindex in their
 * own metadata (a search box has nothing to index; a cart is per-browser), and
 * a sitemap should not advertise what robots are told to skip.
 */
const STATIC_ROUTES = [
  "/",
  "/shop",
  "/size-guide",
  "/shipping",
  "/about",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    ...STATIC_ROUTES,
    // Collections: the season groups, every league, and every team with an
    // approved product.
    ...collectionParams().map((slug) => `/shop/${slug}`),
    // Only approved products — a hidden handle 404s, and a 404 in a sitemap
    // is a crawl error we would be reporting on ourselves.
    ...getVisibleProducts().map((product) => `/product/${product.handle}`),
  ];

  const lastModified = new Date();

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localeUrl(locale, path),
      lastModified,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, localeUrl(l, path)]),
        ),
      },
    })),
  );
}
