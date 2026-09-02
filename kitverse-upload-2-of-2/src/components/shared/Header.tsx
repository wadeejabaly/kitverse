import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues } from "@/data/catalog";
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
 */
export async function Header() {
  const t = await getTranslations("nav");
  const leagues = getLeagues();

  return (
    <header className="header-glass sticky top-0 z-40 border-b border-rule">
      <div className="mx-auto flex w-full max-w-page items-center gap-6 px-6 py-5 wide:gap-10">
        <MobileMenu leagues={leagues} />

        {/* The crest alone. Nothing else names the link, so the badge keeps
            its alt and becomes the link's accessible name. */}
        <Link href="/" className="flex shrink-0 items-center">
          <BrandBadge size={32} priority />
        </Link>

        <nav className="hidden flex-1 gap-6 text-sm wide:flex">
          <HeaderLink href="/shop">{t("shop")}</HeaderLink>
          <HeaderLink href="/shop/national-teams">{t("nationalTeams")}</HeaderLink>
          <HeaderLink href="/shop#league">{t("leagues")}</HeaderLink>
          <HeaderLink href="/size-guide">{t("sizeGuide")}</HeaderLink>
          <HeaderLink href="/about">{t("about")}</HeaderLink>
        </nav>

        {/* Utility row. Ink, not ink-soft: see the note above — over a
            translucent header ink-soft measures 3.1:1 against a dark shirt
            passing beneath, and 3.5:1 against a white tile in dark mode.
            For the same reason hover cannot DIM these (dimming is what
            fails); they take the nav's gold hairline instead, which is
            decoration and costs no text contrast. */}
        <div className="flex items-center gap-5 text-[13px] text-ink ms-auto wide:ms-0">
          <Link href="/search" aria-label={t("search")} className={utilityHover}>
            <SearchIcon />
          </Link>
          <CartLink className={utilityHover} />
          <span aria-hidden className="hidden h-3.5 w-px bg-rule wide:block" />
          <LocaleToggle className={utilityHover} />
        </div>
      </div>
    </header>
  );
}

/** The utility row's hover: the nav's gold hairline, not a colour change. */
const utilityHover =
  "border-b border-transparent pb-0.5 transition-colors hover:border-gold";

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      // The hover underline is the crest gold — the one place a nav item
      // signals itself. The label stays ink; only the hairline changes.
      className="border-b border-transparent pb-1 text-ink transition-colors hover:border-gold"
    >
      {children}
    </Link>
  );
}

/** The one icon in the header — drawn, not a font or an image request. */
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
      className="block"
    >
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.4 10.4 14 14" strokeLinecap="round" />
    </svg>
  );
}
