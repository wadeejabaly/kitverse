import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/config";
import { BUNDLES, bundleWithProducts } from "@/data/bundles";
import { getLeagues, localName } from "@/data/catalog";
import { BundleForm, type BundleShirt } from "@/components/bundle/BundleForm";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Season } from "@/components/shared/Money";
import { Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";
import { bundleTeam } from "../team-name";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => BUNDLES.filter((b) => bundleWithProducts(b.slug)).map((b) => ({ locale, slug: b.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const found = bundleWithProducts(slug);
  if (!found) return {};
  const t = await getTranslations({ locale, namespace: "bundle" });
  const title = t("title", { team: bundleTeam(found.products[0], locale) });
  const image = found.bundle.image ?? found.products[0].image;
  return {
    title,
    description: t("intro"),
    alternates: alternatesFor(locale, `/bundles/${slug}`),
    openGraph: { title, description: t("intro"), images: [{ url: image, alt: title }], type: "website" },
  };
}

/** One club bundle (owner request 2026-11-12): the three shirts, each customised, one gift box. */
export default async function BundlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const found = bundleWithProducts(slug);
  if (!found) notFound();
  const { bundle, products } = found;

  const t = await getTranslations("bundle");
  const tp = await getTranslations("product");
  const team = bundleTeam(products[0], locale);
  const title = t("title", { team });
  const league = getLeagues().find((l) => l.slug === products[0].league);
  const leagueName = league ? localName(league, locale) : null;
  const productTitle = (p: (typeof products)[number]) => (locale === "ar" ? p.titleAr : locale === "he" ? p.titleHe || p.title : p.title);

  const shirts: BundleShirt[] = products.map((p) => ({
    handle: p.handle, season: p.season, league: p.league, team: p.team, kind: p.kind, image: p.image,
    title: productTitle(p), kitLabel: tp(`kit.${p.kit}`),
  }));

  return (
    <Wrap>
      <Breadcrumbs tone="light" className="pt-6" items={[{ label: t("listTitle"), href: "/bundles" }, { label: title }]} />
      <section className="grid items-start gap-8 pt-6 pb-14 wide:grid-cols-[1.08fr_1fr] wide:gap-14">
        <div className="min-w-0 wide:sticky wide:top-24">
          {bundle.image ? (
            <div className="relative aspect-square overflow-hidden rounded-[18px] bg-tile">
              <Image src={bundle.image} alt={title} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map((p, i) => (
                <div key={p.handle} className={`relative aspect-square overflow-hidden rounded-[18px] bg-tile ${i === 0 ? "col-span-2" : ""}`}>
                  <Image src={p.image} alt={productTitle(p)} fill priority={i === 0} sizes={i === 0 ? "(max-width: 1024px) 100vw, 55vw" : "(max-width: 1024px) 50vw, 27vw"} className="object-contain" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="kv-chip">{team}</span>
            <span className="kv-chip latin"><Season value={products[0].season} /></span>
            <span className="kv-chip">{t("threeShirts")}</span>
            <span className="kv-chip">{tp("versionPlayer")}</span>
          </div>
          <h1 className="mt-4 mb-2 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
          <p className="mb-6 text-[15px] text-ink-soft">{t("intro")}</p>
          <BundleForm shirts={shirts} leagueName={leagueName} bundleTitle={title} />
        </div>
      </section>
    </Wrap>
  );
}
