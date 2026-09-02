import { defineRouting } from "next-intl/routing";

/**
 * Locale routing.
 *
 * - `ar` is the DEFAULT and the primary audience's language — it lives at `/`.
 * - `en` is secondary and lives at `/en` (localePrefix "as-needed").
 * - localeDetection is false on purpose: browser language NEVER overrides the
 *   store's market. The site opens in Arabic whatever the browser reports.
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/** Right-to-left locales. `ar` is RTL; `en` is LTR. */
const RTL_LOCALES: ReadonlySet<string> = new Set(["ar"]);

export function getDir(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
