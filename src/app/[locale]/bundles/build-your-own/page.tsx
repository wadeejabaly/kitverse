import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { customBundleShirts } from "@/data/bundles";
import { getLeagues, localName } from "@/data/catalog";
import { CustomBundleForm, type PickableShirt } from "@/components/bundle/CustomBundleForm";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";
import { bundleTeam } from "../team-name";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bundle" });
  return { title: t("customTitle"), description: t("customIntro"), alternates: alternatesFor(locale, "/bundles/build-your-own") };
}

/** "Make your own bundle" (owner request 2026-11-17): any 3 current-season shirts, bundle prices. */
export default async function CustomBundlePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("bundle");
  const tp = await getTranslations("product");
  const leagues = getLeagues();
  const products = customBundleShirts();
  const title = (p: (typeof products)[number]) => (locale === "ar" ? p.titleAr : locale === "he" ? p.titleHe || p.title : p.title);

  const shirts: PickableShirt[] = products.map((p) => {
    const league = leagues.find((l) => l.slug === p.league);
    const teamName = bundleTeam(p, locale);
    return {
      handle: p.handle, season: p.season, league: p.league, team: p.team, kind: p.kind, image: p.image, imageLong: p.imagesLongSleeve?.[0],
      title: title(p), kitLabel: `${teamName} · ${tp(`kit.${p.kit}`)}`,
      teamName, leagueName: league ? localName(league, locale) : null,
      search: [p.team, p.teamAr, p.teamHe, p.title, p.titleAr, p.titleHe, p.season].filter(Boolean).join(" ").toLowerCase(),
    };
  }).sort((a, b) => a.teamName.localeCompare(b.teamName, locale) || a.title.localeCompare(b.title, locale));

  // three different teams' home shirts, to show it's any teams
  const showcase = ["real-madrid", "barcelona", "arsenal", "manchester-united", "liverpool"]
    .map((team) => products.find((p) => p.team === team && p.kit === "Home"))
    .filter((p): p is (typeof products)[number] => !!p)
    .slice(0, 3);

  return (
    <Wrap>
      <Breadcrumbs tone="light" className="pt-6" items={[{ label: t("listTitle"), href: "/bundles" }, { label: t("customTitle") }]} />
      <section className="grid items-start gap-8 pt-6 pb-14 wide:grid-cols-[1fr_1.1fr] wide:gap-14">
        <div className="min-w-0 wide:sticky wide:top-24">
          <div className="grid grid-cols-3 gap-3">
            {showcase.map((p) => (
              <div key={p.handle} className="relative aspect-square overflow-hidden rounded-[14px] bg-tile">
                <Image src={p.image} alt="" fill sizes="(max-width: 1024px) 33vw, 15vw" className="object-contain" />
              </div>
            ))}
          </div>
          <ol className="mt-5 grid gap-2 text-[15px] text-ink-soft">
            <li><b className="text-ink">1.</b> {t("customStep1")}</li>
            <li><b className="text-ink">2.</b> {t("customStep2")}</li>
            <li><b className="text-ink">3.</b> {t("customStep3")}</li>
          </ol>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="kv-chip">{t("threeShirts")}</span>
            <span className="kv-chip">{t("anyTeam")}</span>
          </div>
          <h1 className="mt-4 mb-2 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight font-extrabold tracking-[-0.02em]">{t("customTitle")}</h1>
          <p className="mb-6 text-[15px] text-ink-soft">{t("customIntro")}</p>
          <CustomBundleForm shirts={shirts} bundleTitle={t("customTitle")} />
        </div>
      </section>
    </Wrap>
  );
}
