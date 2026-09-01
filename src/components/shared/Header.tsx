import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues } from "@/data/catalog";
import { CartLink } from "@/components/shared/CartLink";
import { LocaleToggle } from "@/components/shared/LocaleToggle";
import { MobileMenu } from "@/components/shared/MobileMenu";

/**
 * Sticky site header.
 *
 * The wordmark is a Latin logotype and keeps its tracking in both locales —
 * the one sanctioned exception to "never letter-space Arabic", because the
 * letters being tracked are Latin either way (see .wordmark in globals.css).
 *
 * Above 900px the full nav shows; below it everything folds into <MobileMenu>.
 * The layout is plain flex with logical gaps, so Arabic mirrors it whole
 * without a single direction-specific rule.
 */
export async function Header() {
  const t = await getTranslations("nav");
  const leagues = getLeagues();

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-ground">
      <div className="mx-auto flex w-full max-w-page items-center gap-6 px-6 py-5 wide:gap-10">
        <MobileMenu leagues={leagues} />

        <Link href="/" className="wordmark shrink-0">
          KitVerse
        </Link>

        <nav className="hidden flex-1 gap-6 text-sm wide:flex">
          <HeaderLink href="/shop">{t("shop")}</HeaderLink>
          <HeaderLink href="/shop/national-teams">{t("nationalTeams")}</HeaderLink>
          <HeaderLink href="/shop#league">{t("leagues")}</HeaderLink>
          <HeaderLink href="/size-guide">{t("sizeGuide")}</HeaderLink>
          <HeaderLink href="/about">{t("about")}</HeaderLink>
        </nav>

        <div className="flex items-center gap-5 text-[13px] text-ink-soft ms-auto wide:ms-0">
          <Link
            href="/search"
            aria-label={t("search")}
            className="transition-colors hover:text-ink"
          >
            <SearchIcon />
          </Link>
          <CartLink />
          <span aria-hidden className="hidden h-3.5 w-px bg-rule wide:block" />
          <LocaleToggle />
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="border-b border-transparent pb-1 text-ink transition-colors hover:border-ink"
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
