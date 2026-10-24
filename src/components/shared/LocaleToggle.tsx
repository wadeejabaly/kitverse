"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * ar ⇄ en on the current page.
 *
 * `usePathname` from next-intl gives the path with the locale prefix already
 * stripped, so the same value re-prefixes correctly for the other locale and
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

  const other = routing.locales.find((candidate) => candidate !== locale) ?? locale;
  const label = other === "ar" ? t("toArabic") : t("toEnglish");

  return (
    <Link
      href={`${pathname}${query}`}
      locale={other}
      lang={other}
      hrefLang={other}
      aria-label={`${t("language")}: ${label}`}
      className={cn("transition-colors hover:text-ink", className)}
    >
      {label}
    </Link>
  );
}
