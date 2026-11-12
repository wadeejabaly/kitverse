import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildNav } from "@/lib/nav-data";
import { DesktopNav } from "@/components/shared/DesktopNav";
import { BrandBadge } from "@/components/shared/BrandBadge";
import { CartLink } from "@/components/shared/CartLink";
import { LocaleToggle } from "@/components/shared/LocaleToggle";
import { MobileMenu } from "@/components/shared/MobileMenu";

/**
 * Sticky site header.
 *
 * The crest is the only brand mark here — no wordmark text — so the badge
 * carries the "KitVerse" label itself and the home link takes its accessible
 * name from it.
 *
 * The surface is frosted glass (.header-glass): a navy-tinted veil with a
 * backdrop blur, so listings and product shots read as texture beneath it
 * rather than sliding under an opaque bar. Because content of ANY lightness
 * can pass under a translucent header, the utility row is ink rather than
 * ink-soft — ink clears 4.5:1 against the tint over both a white tile and a
 * near-black shirt, and ink-soft does not.
 *
 * Above 900px the full nav shows; below it everything folds into <MobileMenu>.
 * The layout is plain flex with logical gaps, so Arabic mirrors it whole
 * without a single direction-specific rule.
 *
 * Navigation (owner request 2026-11-12): six entries - Shop, National teams, Classics, Leagues,
 * Accessories, More - with navy/gold dropdowns (<DesktopNav/>) and the same entries as nested
 * accordions in <MobileMenu/>. Their content comes from src/lib/nav-data.ts (catalogue + existing routes).
 */
export async function Header() {
  const t = await getTranslations("nav");
  const tAcc = await getTranslations("accessories");
  const locale = await getLocale();
  // the six entries + their dropdowns, all from the existing catalogue and routes (src/lib/nav-data.ts)
  const entries = buildNav(locale, {
    shop: t("shop"), nationalTeams: t("nationalTeams"), retro: t("retro"), leagues: t("leagues"), accessories: t("accessories"), more: t("more"),
    allNationalTeams: t("allNationalTeams"), allClassics: t("allClassics"), classicsByLeague: t("classicsByLeague"), classicsTeams: t("classicsTeams"),
    allAccessories: t("allAccessories"), keychains: tAcc("keychainsLabel"), scarves: tAcc("scarvesLabel"),
    sizeGuide: t("sizeGuide"), trackOrder: t("trackOrder"), about: t("about"), contact: t("contact"),
  });

  return (
    <header className="header-glass header-accent sticky top-0 z-40">
      {/* Header layout (owner request 2026-11-12): crest at the inline start (far right in Arabic), the six
          entries centred, search / language / bag at the inline end. `relative` anchors the wide dropdowns. */}
      <div className="relative mx-auto flex w-full max-w-page items-center gap-6 px-6 py-5 nav:py-3">
        <MobileMenu entries={entries} />

        {/* The crest alone. Nothing else names the link, so the badge keeps
            its alt and becomes the link's accessible name. Sized at 2x the
            original 32px per owner request (2026-10-23). */}
        <Link href="/" className="flex shrink-0 items-center">
          <BrandBadge size={64} priority />
        </Link>

        <DesktopNav entries={entries} label={t("menuBrowse")} />

        {/* Utility row. Ink, not ink-soft: over a translucent header ink-soft measures 3.1:1 against a
            dark shirt passing beneath. Hover takes the gold hairline instead of dimming. */}
        <div className="ms-auto flex shrink-0 items-center gap-5 text-[13px] text-ink nav:ms-0 nav:gap-4 xl:gap-5">
          {/* Search reads as a field on wide screens (glyph + placeholder) but is the same link to /search,
              which owns the real input. Narrower screens keep the bare glyph. */}
          <Link href="/search" aria-label={t("search")} className={`${utilityHover} flex items-center gap-2.5`}>
            <SearchIcon />
            <span aria-hidden className="hidden whitespace-nowrap text-ink-soft xl:inline">
              {t("searchProducts")}
            </span>
          </Link>
          <span aria-hidden className="hidden h-5 w-px bg-rule nav:block" />
          <CartLink className={utilityHover} />
          <span aria-hidden className="hidden h-5 w-px bg-rule nav:block" />
          {/* last = the far left in Arabic, exactly as on the phone header the owner wants kept */}
          <LocaleToggle className={utilityHover} />
        </div>
      </div>
    </header>
  );
}

/** The utility row's hover: the nav's gold hairline, not a colour change. */
const utilityHover =
  "border-b border-transparent pb-0.5 transition-colors hover:border-gold";

/** The one icon in the header — drawn, not a font or an image request. */
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
      className="block"
    >
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.4 10.4 14 14" strokeLinecap="round" />
    </svg>
  );
}
