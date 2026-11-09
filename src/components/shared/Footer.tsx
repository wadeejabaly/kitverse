import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues, localName } from "@/data/catalog";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "./Info";
import { enabledPaymentMethods } from "@/lib/payment-methods";
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
  const locale = await getLocale();
  const leagues = getLeagues();
  const year = String(new Date().getFullYear());
  const pay = enabledPaymentMethods();
  const anyPay = pay.cash || pay.paypal || pay.bit;

  // Redesign phase 2 (2026-11-09): the footer moved onto the homepage's night
  // (--flood-ground) with the hero's blue→gold top rule: the real crest and a
  // short brand line, four link columns, contact (email + Instagram), and the
  // payment methods the checkout supports. The old giant ghost wordmark is
  // retired — the crest says the name.
  return (
    <footer className="kv-footer">
      <div className="mx-auto w-full max-w-page px-6 pt-14 pb-10">
        <div className="grid gap-10 wide:grid-cols-[1.3fr_repeat(4,1fr)] wide:gap-8">
          <div className="flex flex-col items-start gap-4">
            <Link href="/" aria-label="KitVerse" className="flex items-center gap-3">
              <BrandBadge size={56} className="shrink-0" />
            </Link>
            <p className="max-w-[34ch] text-[14px] leading-relaxed">{t("description")}</p>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-[13px] font-semibold text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
              </svg>
              <bdi dir="ltr">{INSTAGRAM_HANDLE}</bdi>
            </a>
          </div>

          <FooterColumn label={t("shopGroup")}>
            <FooterLink href="/shop">{t("allShirts")}</FooterLink>
            <FooterLink href="/shop/national-teams">{tNav("nationalTeams")}</FooterLink>
            <FooterLink href="/shop/retro">{t("retro")}</FooterLink>
            <FooterLink href="/accessories">{tNav("accessories")}</FooterLink>
          </FooterColumn>

          <FooterColumn label={tNav("leagues")}>
            {leagues.map((league) => (
              <FooterLink key={league.slug} href={`/shop/${league.slug}`}>
                {localName(league, locale)}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn label={t("helpGroup")}>
            <FooterLink href="/help">{tNav("help")}</FooterLink>
            <FooterLink href="/size-guide">{tNav("sizeGuide")}</FooterLink>
            <FooterLink href="/shipping">{t("shippingPolicy")}</FooterLink>
            <FooterLink href="/returns">{t("returnsPolicy")}</FooterLink>
            {/* /o/track lives outside the [locale] route tree (same reason the thank-you page's
                order link uses a plain <a>, not the i18n Link). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- outside this root layout, so this is a full page load anyway */}
            <a href="/o/track" className="text-start text-[14px]">
              {tNav("trackOrder")}
            </a>
          </FooterColumn>

          <FooterColumn label={t("contactGroup")}>
            <FooterLink href="/about">{tNav("about")}</FooterLink>
            <FooterLink href="/contact">{tNav("contact")}</FooterLink>
            {/* mailto is not an http(s) URL, so it stays out of the
                getSiteUrl() rule. */}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-start text-[14px]">
              <bdi dir="ltr">{CONTACT_EMAIL}</bdi>
            </a>
          </FooterColumn>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-white/10 pt-6 wide:flex-row wide:items-center wide:justify-between">
          {/* Only the methods checkout really offers — see payment-methods.ts. */}
          {anyPay ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="me-1 text-[12.5px]">{t("weAccept")}</span>
              {pay.bit ? <span className="kv-pay latin">Bit</span> : null}
              {pay.paypal ? <span className="kv-pay latin">PayPal</span> : null}
              {pay.cash ? <span className="kv-pay">{t("cashOnDelivery")}</span> : null}
            </div>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
            <Link href="/privacy">{t("privacy")}</Link>
            <Link href="/terms">{t("terms")}</Link>
            <CookieSettingsButton />
            <span className="tabular">
              <bdi>{t("rights", { year })}</bdi>
            </span>
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
      <span className="kv-footer-head">{label}</span>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-start text-[14px]">
      {children}
    </Link>
  );
}
