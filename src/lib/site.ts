import { routing } from "@/i18n/config";

/**
 * The law of absolute URLs: every absolute URL derives from getSiteUrl() —
 * never a literal. metadataBase, robots, sitemap, JSON-LD and OG URLs all read
 * it, so the domain lives in exactly one environment variable and a stale
 * placeholder domain can never reach production.
 *
 * This file is the ONE place preflight allows an absolute URL to be assembled.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  // Vercel previews: derive from the deployment URL so OG/canonical work there too.
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/**
 * The social share card: the KitVerse crest centred on the site ground, no
 * text — the platforms render the title and description themselves, and a
 * baked-in headline would go stale and would be wrong in one of the two
 * locales whichever language it was set in.
 *
 * Built absolute here rather than left relative, because several crawlers
 * (and every link-preview bot that does not run our metadataBase resolution)
 * want a fully-qualified URL.
 */
export const OG_IMAGE = {
  path: "/brand/og.png",
  width: 1200,
  height: 630,
  type: "image/png",
} as const;

export function ogImageUrl(): string {
  return `${getSiteUrl()}${OG_IMAGE.path}`;
}

/**
 * Path for a locale under localePrefix 'as-needed':
 * default locale lives at `/`, others at `/{locale}`.
 */
export function localePath(locale: string, path: string = "/"): string {
  const suffix = path === "/" ? "" : path;
  if (locale === routing.defaultLocale) return suffix === "" ? "/" : suffix;
  return `/${locale}${suffix}`;
}

/** Absolute URL for a locale + path — sitemap/hreflang building block. */
export function localeUrl(locale: string, path: string = "/"): string {
  return `${getSiteUrl()}${localePath(locale, path)}`;
}

/**
 * Metadata `alternates` for a page: canonical + hreflang for every shipped
 * locale + x-default → the default locale (ar). Search engines need this to
 * serve the right language version.
 */
export function alternatesFor(currentLocale: string, path: string = "/") {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = localeUrl(locale, path);
  }
  languages["x-default"] = localeUrl(routing.defaultLocale, path);
  return {
    canonical: localeUrl(currentLocale, path),
    languages,
  };
}
