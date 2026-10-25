import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { accessoriesByCategory } from "@/data/accessories";
import { AccessoryGrid } from "@/components/shop/AccessoryCard";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "accessories" });
  return {
    title: t("keychainsLabel"),
    description: t("categoryMetaDescription"),
    alternates: alternatesFor(locale, "/accessories/keychains"),
  };
}

/**
 * Every team-branded keychain, one card per team (national + club alike —
 * the same set src/data/catalog.ts's getTeams() lists). Flat list today
 * rather than the shop's league/team filter rail: 96 cards is small enough
 * to browse directly, and adding a filter rail here is easy to revisit once
 * there is more than one accessory type to tell apart.
 */
export default async function KeychainsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("accessories");

  const keychains = accessoriesByCategory("keychain");

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("keychainsLabel")} intro={t("keychainsIntro")} />

      <section className="pt-8 pb-[clamp(72px,10vw,120px)]">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-rule pb-4">
          <span className="mono-eyebrow text-ink-soft">
            {t("count", { count: keychains.length, countText: String(keychains.length) })}
          </span>
          <Link
            href="/accessories"
            className="mono-eyebrow text-ink-soft transition-colors hover:text-ink"
          >
            {t("eyebrow")}
          </Link>
        </div>

        <AccessoryGrid accessories={keychains} locale={locale} priorityCount={4} reveal />
      </section>
    </Wrap>
  );
}
