import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues, type League } from "@/data/catalog";
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
 * "Leagues" (2026-10-25): the mockup had this as a flat link straight down to
 * the shop's league filter — fine when the shop was the only place to browse
 * by league, but the owner's "categories in the header" ask treats the
 * leagues themselves as the category list, so <LeaguesMenu/> below reveals
 * them directly, the same data <Footer/> and <MobileMenu/> already read.
 */
export async function Header() {
  const t = await getTranslations("nav");
  const locale = await getLocale();
  const leagues = getLeagues();

  return (
    <header className="header-glass header-accent sticky top-0 z-40">
      <div className="mx-auto flex w-full max-w-page items-center gap-6 px-6 py-5 wide:gap-10">
        <MobileMenu leagues={leagues} />

        {/* The crest alone. Nothing else names the link, so the badge keeps
            its alt and becomes the link's accessible name. Sized at 2x the
            original 32px per owner request (2026-10-23). */}
        <Link href="/" className="flex shrink-0 items-center">
          <BrandBadge size={64} priority />
        </Link>

        <nav className="hidden flex-1 gap-6 text-sm wide:flex">
          <HeaderLink href="/shop">{t("shop")}</HeaderLink>
          <HeaderLink href="/shop/national-teams">{t("nationalTeams")}</HeaderLink>
          <LeaguesMenu leagues={leagues} locale={locale} label={t("leagues")} />
          <HeaderLink href="/accessories">{t("accessories")}</HeaderLink>
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

/**
 * "Leagues" as a category dropdown, not just a link.
 *
 * Pure CSS (group-hover / group-focus-within) — no client component, no
 * JS state, nothing to hydrate — in keeping with how little of this header
 * is interactive JS to begin with (<MobileMenu/> is the one exception, and
 * that overlay genuinely needs state). Hover reveals it with a mouse;
 * group-focus-within reveals it the same way for keyboard focus, since
 * focus lands inside the panel the moment Tab reaches one of its links —
 * so a keyboard user never needs a separate "open" keystroke, and it closes
 * itself the moment focus (or the pointer) leaves the group.
 *
 * The trigger still navigates to the shop's own league filter (`#league`)
 * on a plain click/Enter — the panel is an accelerator to a specific
 * league, not the only way to reach any of them.
 */
function LeaguesMenu({
  leagues,
  locale,
  label,
}: {
  leagues: League[];
  locale: string;
  label: string;
}) {
  if (leagues.length === 0) {
    return <HeaderLink href="/shop#league">{label}</HeaderLink>;
  }

  return (
    <div className="group relative">
      <Link
        href="/shop#league"
        className="flex items-center gap-1 border-b border-transparent pb-1 text-ink transition-colors hover:border-gold group-focus-within:border-gold"
      >
        {label}
        <ChevronIcon className="transition-transform duration-200 ease-out group-hover:-rotate-180 group-focus-within:-rotate-180" />
      </Link>

      {/* Flush against the header's own bottom edge, flat and opaque — the
          site's hairline-and-fill vocabulary (border-rule, bg-ground), not a
          soft-UI card: no radius (see the sitewide radius:0 law) and no
          shadow, just a border, the same way <MobileMenu/>'s overlay and
          every product tile already read. Five leagues today, one column —
          revisit a multi-column layout if the catalog ever outgrows it. */}
      <div
        role="menu"
        aria-label={label}
        className="invisible absolute start-0 top-full z-50 flex w-max min-w-44 flex-col border border-rule bg-ground p-2 opacity-0 transition-[opacity,visibility] duration-150 ease-out group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {leagues.map((league) => (
          <Link
            key={league.slug}
            href={`/shop/${league.slug}`}
            role="menuitem"
            className="px-4 py-2 text-[13px] whitespace-nowrap text-ink-soft transition-colors hover:bg-tile hover:text-ink"
          >
            {locale === "ar" ? league.nameAr : league.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The dropdown's one affordance that isn't a link — rotates open on hover
    or focus, the same transition every other hover state in this header
    uses, so it reads as part of the same system rather than a new one. */
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
