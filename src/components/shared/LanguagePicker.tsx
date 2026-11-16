"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { getPathname, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/config";

/**
 * First-visit language choice (owner request 2026-11-14): "when the customer goes into the website it
 * asks him which language - Arabic, English, Hebrew - and whichever he clicks is the site language; keep
 * the change-language option". The header's <LocaleToggle/> stays as it is.
 *
 * - Shown once per browser (localStorage `kv-lang`), only after the home page film intro has finished
 *   (it never covers the film). Closing it without a choice keeps the current language and counts as a choice.
 * - Picking a language goes to the SAME page in that language (path + query kept).
 * - Afterwards: a visitor who arrives from outside the site (new tab, Google, Instagram link) on a page
 *   in another language is sent to the same page in their chosen language. Moving around inside the site
 *   never redirects, so following a link to another language still works.
 * - <LocaleToggle/> calls rememberLocale() too, so the header switch also updates the saved choice.
 */
export const LANG_KEY = "kv-lang";

export function rememberLocale(locale: string) {
  try { localStorage.setItem(LANG_KEY, locale); } catch { /* private mode: just no memory */ }
  // next-intl's own cookie, for anything that reads it later (localeDetection stays off on purpose)
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function savedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return (routing.locales as readonly string[]).includes(v ?? "") ? (v as Locale) : null;
  } catch { return null; }
}

/** True while the home page film plays (or is about to): the picker waits. */
function introBusy() {
  const r = document.documentElement;
  return r.hasAttribute("data-kv-intro") || !!document.querySelector('.kv-vhero[data-intro="playing"]');
}

const OPTIONS: { locale: Locale; label: string; hint: string; dir: "rtl" | "ltr" }[] = [
  { locale: "ar", label: "العربية", hint: "تصفّح الموقع بالعربي", dir: "rtl" },
  { locale: "he", label: "עברית", hint: "גלישה באתר בעברית", dir: "rtl" },
  { locale: "en", label: "English", hint: "Browse the site in English", dir: "ltr" },
];

export function LanguagePicker() {
  const locale = useLocale();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [show, setShow] = useState(false);

  const hrefFor = (target: Locale) => getPathname({ href: pathname, locale: target }) + window.location.search + window.location.hash;

  useEffect(() => {
    const saved = savedLocale();
    if (saved) {
      // returning visitor arriving from outside the site on another language -> their language
      let external = true;
      try { external = !document.referrer || new URL(document.referrer).host !== location.host; } catch { /* keep true */ }
      if (saved !== locale && external) window.location.replace(hrefFor(saved));
      return;
    }
    // Since 2026-11-16 the first visit is already sent to the phone's language by src/proxy.ts (which
    // sets NEXT_LOCALE). Asking again on top of that blocked the whole page for ad visitors (78% left
    // after one page), so a visitor routed that way just keeps the language they landed in; the
    // header switch still changes it.
    if (/(?:^|;\s*)NEXT_LOCALE=/.test(document.cookie)) {
      rememberLocale(locale);
      return;
    }
    let timer = 0;
    const tryOpen = () => {
      if (introBusy()) { timer = window.setTimeout(tryOpen, 500); return; }
      setShow(true);
    };
    timer = window.setTimeout(tryOpen, 600);
    return () => window.clearTimeout(timer);
    // first mount only: a route change inside the site must not re-run this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (show && d && !d.open) d.showModal();
  }, [show]);

  const choose = (target: Locale) => {
    rememberLocale(target);
    dialogRef.current?.close();
    setShow(false);
    if (target !== locale) window.location.assign(hrefFor(target));
  };

  if (!show) return null;
  return (
    <dialog
      ref={dialogRef}
      className="kv-langpick"
      aria-labelledby="kv-langpick-title"
      onCancel={() => choose(locale as Locale)}
    >
      <div className="kv-langpick-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/badge.png" alt="KitVerse" width={72} height={72} className="kv-langpick-badge" />
        <h2 id="kv-langpick-title" className="kv-langpick-title">
          <span dir="rtl" lang="ar">اختار اللغة</span>
          <span dir="rtl" lang="he">בחרו שפה</span>
          <span dir="ltr" lang="en">Choose your language</span>
        </h2>
        <ul className="kv-langpick-list">
          {OPTIONS.map((o) => (
            <li key={o.locale}>
              <button type="button" lang={o.locale} dir={o.dir} onClick={() => choose(o.locale)}
                className="kv-langpick-opt" aria-current={o.locale === locale ? "true" : undefined} autoFocus={o.locale === locale}>
                <span className="kv-langpick-label">{o.label}</span>
                <span className="kv-langpick-hint">{o.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="kv-langpick-note">
          <span dir="rtl" lang="ar">بتقدر تغيّرها بأي وقت من فوق</span>
          <span dir="rtl" lang="he">אפשר לשנות בכל רגע למעלה</span>
          <span dir="ltr" lang="en">You can change it anytime at the top</span>
        </p>
      </div>
    </dialog>
  );
}
