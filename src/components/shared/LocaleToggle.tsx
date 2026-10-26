"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Message key under "nav" for each locale's own-language name, e.g. t(LOCALE_LABEL_KEYS.he). */
const LOCALE_LABEL_KEYS: Record<string, string> = {
  ar: "toArabic",
  en: "toEnglish",
  he: "toHebrew",
};

/**
 * Switches to any OTHER locale from the current page (ar / en / he — three
 * now, not just two, so this renders every other locale rather than picking
 * a single "the other one").
 *
 * `usePathname` from next-intl gives the path with the locale prefix already
 * stripped, so the same value re-prefixes correctly for each other locale and
 * the reader lands on the page they were on, not the home page.
 *
 * The query string is picked up from the browser after mount rather than with
 * useSearchParams — the header renders on every route, and useSearchParams
 * would force a Suspense boundary around it site-wide. Starting empty keeps
 * the first client render identical to the server's.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(window.location.search);
  }, [pathname]);

  const others = routing.locales.filter((candidate) => candidate !== locale);

  return (
    <span className={cn("flex items-center gap-2", className)}>
      {others.map((other, i) => {
        const label = t(LOCALE_LABEL_KEYS[other] ?? other);
        return (
          <span key={other} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>·</span> : null}
            <Link
              href={`${pathname}${query}`}
              locale={other}
              lang={other}
              hrefLang={other}
              aria-label={`${t("language")}: ${label}`}
              className="transition-colors hover:text-ink"
            >
              {label}
            </Link>
          </span>
        );
      })}
    </span>
  );
}
