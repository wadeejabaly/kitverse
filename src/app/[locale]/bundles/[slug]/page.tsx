import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/config";
import { BUNDLES, FAN_BUNDLES, bundleWithProducts, fanBundleWithProducts } from "@/data/bundles";
import { accessoryVariant } from "@/data/accessories";
import { FanBundleForm } from "@/components/bundle/FanBundleForm";
import { getLeagues, localName } from "@/data/catalog";
import { BundleForm, type BundleShirt } from "@/components/bundle/BundleForm";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Season } from "@/components/shared/Money";
import { Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";
import { bundleTeam } from "../team-name";

export function generateStaticParams() {
  const slugs = [...BUNDLES.filter((b) => bundleWithProducts(b.slug)).map((b) => b.slug), ...FAN_BUNDLES.filter((b) => fanBundleWithProducts(b.slug)).map((b) => b.slug)];
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "bundle" });
  const fan = fanBundleWithProducts(slug);
  if (fan) {
    const title = t("fanTitle", { team: bundleTeam(fan.shirts[0], locale) });
    return { title, description: t("fanIntro"), alternates: alternatesFor(locale, `/bundles/${slug}`), openGraph: { title, description: t("fanIntro"), images: [{ url: fan.shirts[0].image, alt: title }], type: "website" } };
  }
  const found = bundleWithProducts(slug);
  if (!found) return {};
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
  if (fanBundleWithProducts(slug)) return <FanBundlePage locale={locale} slug={slug} />;
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
    handle: p.handle, season: p.season, league: p.league, team: p.team, kind: p.kind, image: p.image, imageLong: p.imagesLongSleeve?.[0],
    title: productTitle(p), kitLabel: tp(`kit.${p.kit}`),
  }));

  return (
    <Wrap>
      <Breadcrumbs tone="light" className="pt-6" items={[{ label: t("listTitle"), href: "/bundles" }, { label: title }]} />
      <section className="grid items-start gap-8 pt-6 pb-14 wide:grid-cols-[1.08fr_1fr] wide:gap-14">
        <div className="min-w-0 wide:sticky wide:top-24">
          {bundle.image ? (
            <>
              <div className="relative aspect-square overflow-hidden rounded-[18px] bg-tile">
                <Image src={bundle.image} alt={title} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {products.map((p) => (
                  <div key={p.handle} className="relative aspect-square overflow-hidden rounded-[14px] bg-tile">
                    <Image src={p.image} alt={productTitle(p)} fill sizes="(max-width: 1024px) 33vw, 18vw" className="object-contain" />
                  </div>
                ))}
              </div>
            </>
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
          <BundleForm shirts={shirts} leagueName={leagueName} bundleTitle={title} bundleSlug={bundle.slug} />
        </div>
      </section>
    </Wrap>
  );
}

/** A fan bundle (owner request 2026-11-15): one shirt (pick home/away/third, fan or player) + keychain + scarf. */
async function FanBundlePage({ locale, slug }: { locale: string; slug: string }) {
  const fan = fanBundleWithProducts(slug)!;
  const t = await getTranslations("bundle");
  const tp = await getTranslations("product");
  const team = bundleTeam(fan.shirts[0], locale);
  const title = t("fanTitle", { team });
  const league = getLeagues().find((l) => l.slug === fan.shirts[0].league);
  const leagueName = league ? localName(league, locale) : null;
  const productTitle = (p: (typeof fan.shirts)[number]) => (locale === "ar" ? p.titleAr : locale === "he" ? p.titleHe || p.title : p.title);
  const shirts: BundleShirt[] = fan.shirts.map((p) => ({
    handle: p.handle, season: p.season, league: p.league, team: p.team, kind: p.kind, image: p.image, imageLong: p.imagesLongSleeve?.[0],
    title: productTitle(p), kitLabel: tp(`kit.${p.kit}`),
  }));
  const accLabel = (a: (typeof fan.scarves)[number]) => accessoryVariant(a, locale) ?? team;

  return (
    <Wrap>
      <Breadcrumbs tone="light" className="pt-6" items={[{ label: t("listTitle"), href: "/bundles" }, { label: title }]} />
      <section className="grid items-start gap-8 pt-6 pb-14 wide:grid-cols-[1.08fr_1fr] wide:gap-14">
        <div className="min-w-0 wide:sticky wide:top-24">
          <div className="relative aspect-square overflow-hidden rounded-[18px] bg-tile">
            <Image src={fan.shirts[0].image} alt={title} fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-contain" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[fan.keychain.image, fan.scarves[0].image, ...fan.shirts.slice(1, 2).map((p) => p.image)].map((src) => (
              <div key={src} className="relative aspect-square overflow-hidden rounded-[14px] bg-tile">
                <Image src={src} alt="" fill sizes="(max-width: 1024px) 33vw, 18vw" className="object-contain" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="kv-chip">{team}</span>
            <span className="kv-chip latin"><Season value={fan.shirts[0].season} /></span>
            <span className="kv-chip">{t("fanChip")}</span>
          </div>
          <h1 className="mt-4 mb-2 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
          <p className="mb-6 text-[15px] text-ink-soft">{t("fanIntro")}</p>
          <FanBundleForm
            slug={slug}
            shirts={shirts}
            keychain={{ handle: fan.keychain.handle, category: "keychain", image: fan.keychain.image, label: team }}
            scarves={fan.scarves.map((s) => ({ handle: s.handle, category: "scarf" as const, image: s.image, label: accLabel(s) }))}
            leagueName={leagueName}
            bundleTitle={title}
          />
        </div>
      </section>
    </Wrap>
  );
}
