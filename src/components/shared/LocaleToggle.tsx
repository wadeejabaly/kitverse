"use client";

import { useEffect, useRef, useState } from "react";
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
 * A click-to-open language picker (owner ask 2026-10-26: "make it a
 * dropdown" — the three-locale inline row from the previous wave read as
 * clutter in the utility row). Same visual vocabulary as <LeaguesMenu/> in
 * Header.tsx: a flat, no-radius bg-ground/border-rule panel and a chevron
 * that rotates open — but click-triggered rather than hover-triggered,
 * since a language switch is a deliberate choice, not something to reveal
 * by brushing past it with a mouse, and hover has no equivalent on touch.
 *
 * The trigger shows the CURRENT locale's own name (not a generic globe/
 * "Language" label) so the header always states which language you're
 * reading in; the panel below lists every OTHER locale.
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(window.location.search);
  }, [pathname]);

  // A navigation (picking a locale, or following any other link) closes the
  // panel — it should never still be open over a page the reader didn't open
  // it on.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Click-outside and Escape both dismiss, same as <MobileMenu/>'s overlay.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const others = routing.locales.filter((candidate) => candidate !== locale);
  const currentLabel = t(LOCALE_LABEL_KEYS[locale] ?? locale);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("language")}: ${currentLabel}`}
        className={cn("flex items-center gap-1", className)}
      >
        {currentLabel}
        <ChevronIcon
          className={cn("transition-transform duration-200 ease-out", open && "-rotate-180")}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t("language")}
          className="absolute end-0 top-full z-50 mt-2 flex w-max min-w-28 flex-col border border-rule bg-ground p-2"
        >
          {others.map((other) => (
            <Link
              key={other}
              href={`${pathname}${query}`}
              locale={other}
              lang={other}
              hrefLang={other}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-[13px] whitespace-nowrap text-ink-soft transition-colors hover:bg-tile hover:text-ink"
            >
              {t(LOCALE_LABEL_KEYS[other] ?? other)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Same chevron glyph as <LeaguesMenu/>'s — rotates open the same way, so
    this reads as the same dropdown vocabulary rather than a new one. */
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
      className={className}
    >
      <path d="M3.5 6 8 10.5 12.5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
