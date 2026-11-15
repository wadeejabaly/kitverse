import { defineRouting } from "next-intl/routing";

/**
 * Locale routing.
 *
 * - `ar` is the DEFAULT and the primary audience's language — it lives at `/`.
 * - `en` is secondary and lives at `/en` (localePrefix "as-needed").
 * - `he` (added 2026-10-26, owner request) is secondary too and lives at
 *   `/he` — many of the same Israeli shoppers read Hebrew, and several data
 *   files (localities, the DB schema's `*_he` columns) were already built
 *   anticipating it.
 * - localeDetection stays false (next-intl's own detection is off). Instead, owner
 *   request 2026-11-16: on a browser's FIRST visit src/proxy.ts sends it to the
 *   phone's language once (ar -> Arabic, en -> English, he/anything else -> Hebrew,
 *   `src/lib/phone-locale.ts`) and sets NEXT_LOCALE; after that the URL is respected.
 */
export const routing = defineRouting({
  locales: ["ar", "en", "he"],
  defaultLocale: "ar",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/** Right-to-left locales. `ar` and `he` are RTL; `en` is LTR. */
const RTL_LOCALES: ReadonlySet<string> = new Set(["ar", "he"]);

export function getDir(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
