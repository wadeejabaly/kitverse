import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { accessoriesByCategory } from "@/data/accessories";
import { AccessoryGrid } from "@/components/shop/AccessoryCard";
import { AccessoryDealNote } from "@/components/product/AccessoryDealNote";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "accessories" });
  return { title: t("scarvesLabel"), description: t("scarvesIntro"), alternates: alternatesFor(locale, "/accessories/scarves") };
}

/** Scarves (owner request 2026-11-10) - same flat grid as the keychains page; one card per design. */
export default async function ScarvesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("accessories");
  const scarves = accessoriesByCategory("scarf");

  return (
    <Wrap>
      <PageLede
        eyebrow={t("eyebrow")}
        title={t("scarvesLabel")}
        intro={t("scarvesIntro")}
        crumbs={[{ label: t("categoryTitle"), href: "/accessories" }, { label: t("scarvesLabel") }]}
        art="/home/cat-accessories.webp"
      />
      <section className="pt-8 pb-[clamp(72px,10vw,120px)]">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-rule pb-4">
          <span className="mono-eyebrow text-ink-soft">{t("count", { count: scarves.length, countText: String(scarves.length) })}</span>
          <Link href="/accessories" className="mono-eyebrow text-ink-soft transition-colors hover:text-ink">
            {t("eyebrow")}
          </Link>
        </div>
        <AccessoryDealNote category="scarf" className="mb-6" />
        <AccessoryGrid accessories={scarves} locale={locale} priorityCount={4} reveal />
      </section>
    </Wrap>
  );
}
