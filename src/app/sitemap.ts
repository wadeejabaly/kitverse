import type { MetadataRoute } from "next";
import { routing } from "@/i18n/config";
import { localeUrl } from "@/lib/site";

/**
 * Sitemap — every URL derives from getSiteUrl() via localeUrl(), never a
 * literal. Add routes here as the store grows (shop, collections, and the
 * product pages, which wave 2 generates from the catalog). Per-locale hreflang
 * alternates are included per entry.
 */
const ROUTES = ["/", "/privacy", "/terms"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localeUrl(locale, path),
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, localeUrl(l, path)]),
        ),
      },
    })),
  );
}
