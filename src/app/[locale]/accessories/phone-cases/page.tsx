import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { accessoriesByCategory, accessoryTeam } from "@/data/accessories";
import { AccessoryGrid } from "@/components/shop/AccessoryCard";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "accessories" });
  return { title: t("phoneCasesLabel"), description: t("phoneCasesIntro"), alternates: alternatesFor(locale, "/accessories/phone-cases") };
}

/** Phone cases (owner request 2026-11-16) - same flat grid as the scarves page; one card per design + colour. */
export default async function PhoneCasesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("accessories");
  const cases = accessoriesByCategory("phone_case");
  const teams = [...new Set(cases.map((c) => c.team))];

  return (
    <Wrap>
      <PageLede
        eyebrow={t("eyebrow")}
        title={t("phoneCasesLabel")}
        intro={t("phoneCasesIntro")}
        crumbs={[{ label: t("categoryTitle"), href: "/accessories" }, { label: t("phoneCasesLabel") }]}
        art="/home/cat-accessories.webp"
      />
      <section className="pt-8 pb-[clamp(72px,10vw,120px)]">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-rule pb-4">
          <span className="mono-eyebrow text-ink-soft">{t("count", { count: cases.length, countText: String(cases.length) })}</span>
          <Link href="/accessories" className="mono-eyebrow text-ink-soft transition-colors hover:text-ink">
            {t("eyebrow")}
          </Link>
        </div>
        {teams.map((team, i) => {
          const list = cases.filter((c) => c.team === team);
          return (
            <div key={team} className={i ? "mt-12" : ""}>
              <h2 className="mb-5 text-[clamp(1.3rem,2.4vw,1.7rem)] font-extrabold">{accessoryTeam(list[0], locale)}</h2>
              <AccessoryGrid accessories={list} locale={locale} priorityCount={i ? 0 : 4} reveal />
            </div>
          );
        })}
      </section>
    </Wrap>
  );
}
