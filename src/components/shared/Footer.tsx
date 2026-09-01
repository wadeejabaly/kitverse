import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues } from "@/data/catalog";
import { BrandBadge } from "./BrandBadge";
import { CookieSettingsButton } from "./CookieSettingsButton";

/**
 * Site footer: shop columns, help, legal, contact — the mockup's four-column
 * layout. The privacy and terms links are mandatory and are never removed;
 * preflight checks that both routes exist and the launch gate checks they are
 * reachable.
 */
export async function Footer() {
  const t = await getTranslations("footer");
  const tNav = await getTranslations("nav");
  const tAbout = await getTranslations("about");
  const locale = await getLocale();
  const leagues = getLeagues();
  // String, not number: next-intl would render ٢٠٢٦ for ar — Latin numerals
  // always, in every locale.
  const year = String(new Date().getFullYear());

  return (
    // The footer's top hairline is the crest gold — the site's one full-width
    // brand mark, and the boundary it draws is real (page ends, footer begins).
    <footer className="border-t border-gold">
      <div className="mx-auto w-full max-w-page px-6 pt-10 pb-14">
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-10">
          <FooterColumn label={t("shopGroup")}>
            {leagues.map((league) => (
              <FooterLink key={league.slug} href={`/shop/${league.slug}`}>
                {locale === "ar" ? league.nameAr : league.name}
              </FooterLink>
            ))}
            <FooterLink href="/shop/national-teams">{tNav("nationalTeams")}</FooterLink>
          </FooterColumn>

          <FooterColumn label={t("helpGroup")}>
            <FooterLink href="/shipping">{tNav("shipping")}</FooterLink>
            <FooterLink href="/size-guide">{tNav("sizeGuide")}</FooterLink>
            <FooterLink href="/about">{tNav("about")}</FooterLink>
          </FooterColumn>

          <FooterColumn label={t("legalGroup")}>
            <FooterLink href="/privacy">{t("privacy")}</FooterLink>
            <FooterLink href="/terms">{t("terms")}</FooterLink>
            <CookieSettingsButton />
          </FooterColumn>

          <FooterColumn label={t("contactGroup")}>
            {/* mailto is not an http(s) URL, so it stays out of the
                getSiteUrl() rule — the address itself lives in messages. */}
            <a
              href={`mailto:${tAbout("email")}`}
              className="text-start text-[13px] text-ink-soft transition-colors hover:text-ink"
            >
              <bdi dir="ltr">{tAbout("email")}</bdi>
            </a>
          </FooterColumn>
        </div>

        {/* Brand line: the crest beside the tagline and the rights notice.
            A flex gap again — the badge takes the inline start in both
            directions with no direction-specific rule. */}
        <div className="flex items-center gap-4 pt-9 text-[13px] text-ink-soft">
          <BrandBadge size={40} className="shrink-0" />
          <div className="flex flex-col gap-1">
            <p>{t("tagline")}</p>
            <p className="tabular">
              <bdi>{t("rights", { year })}</bdi>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2.5">
      <span className="mono-eyebrow mb-1 text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-start text-[13px] text-ink-soft transition-colors hover:text-ink"
    >
      {children}
    </Link>
  );
}
