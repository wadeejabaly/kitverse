import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { availableBundles, availableFanBundles, BUNDLE_VERSION } from "@/data/bundles";
import { accessoryBundlePrice, accessoryListPrice, priceFor } from "@/data/pricing";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Price } from "@/components/shared/Money";
import { alternatesFor } from "@/lib/site";
import { bundleTeam } from "./team-name";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bundle" });
  return { title: t("listTitle"), description: t("listIntro"), alternates: alternatesFor(locale, "/bundles") };
}

/** Bundles (owner request 2026-11-12): one tile per club bundle - see src/data/bundles.ts. */
export default async function BundlesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("bundle");
  const bundles = availableBundles();
  const fanBundles = availableFanBundles();
  const keyB = accessoryBundlePrice("keychain") ?? 0, keyN = accessoryListPrice("keychain") ?? keyB;
  const scarfB = accessoryBundlePrice("scarf") ?? 0, scarfN = accessoryListPrice("scarf") ?? scarfB;

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("listTitle")} intro={t("listIntro")} crumbs={[{ label: t("listTitle") }]} />
      {/* Fan bundles (owner request 2026-11-15): shirt + keychain + scarf, with the saving */}
      {fanBundles.length ? (
        <>
          <h2 className="mt-10 mb-1 text-[1.35rem] font-extrabold">{t("fanListTitle")}</h2>
          <p className="mb-5 text-[15px] text-ink-soft">{t("fanListIntro")}</p>
          <section className="grid gap-5 sm:grid-cols-3">
            {fanBundles.map(({ bundle, shirts, keychain, scarves }) => {
              const team = bundleTeam(shirts[0], locale);
              const price = priceFor(shirts[0].season, "M", "fan", "short", undefined, true) + keyB + scarfB;
              const normal = priceFor(shirts[0].season, "M", "fan") + keyN + scarfN;
              return (
                <Link key={bundle.slug} href={`/bundles/${bundle.slug}`} className="kv-pcard group">
                  <span className="kv-pcard-media">
                    <span className="grid w-full grid-cols-3 items-center gap-1 px-2">
                      {[shirts[0].image, keychain.image, scarves[0].image].map((src) => (
                        <Image key={src} src={src} alt="" width={300} height={300} sizes="(max-width: 640px) 33vw, 11vw"
                          className="h-auto w-full mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.04]" />
                      ))}
                    </span>
                  </span>
                  <span className="kv-pcard-body">
                    <span className="kv-pcard-team">{t("fanChip")}</span>
                    <span className="kv-pcard-title text-[17px]">{t("fanTitle", { team })}</span>
                    <span className="kv-pcard-price flex flex-wrap items-baseline gap-2">
                      <Price value={price} />
                      {normal > price ? (
                        <span className="text-[12.5px] font-bold text-[#14713d]">
                          {t("youSave")} <Price value={Math.round((normal - price) * 100) / 100} />
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              );
            })}
          </section>
          <h2 className="mt-12 mb-1 text-[1.35rem] font-extrabold">{t("clubListTitle")}</h2>
        </>
      ) : null}
      <section className="grid gap-5 pt-5 pb-[clamp(72px,10vw,120px)] sm:grid-cols-2">
        {bundles.map(({ bundle, products }) => {
          const team = bundleTeam(products[0], locale);
          const from = products.reduce((s, p) => s + priceFor(p.season, "M", BUNDLE_VERSION, "short", undefined, true), 0);
          const full = products.reduce((s, p) => s + priceFor(p.season, "M", BUNDLE_VERSION), 0);
          return (
            <Link key={bundle.slug} href={`/bundles/${bundle.slug}`} className="kv-pcard group">
              <span className="kv-pcard-media">
                {bundle.image ? (
                  <Image src={bundle.image} alt="" fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />
                ) : (
                  <span className="grid w-full grid-cols-3 gap-1 px-3">
                    {products.map((p) => (
                      <Image key={p.handle} src={p.image} alt="" width={400} height={400} sizes="(max-width: 640px) 33vw, 17vw"
                        className="h-auto w-full mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.04]" />
                    ))}
                  </span>
                )}
              </span>
              <span className="kv-pcard-body">
                <span className="kv-pcard-team">{t("threeShirts")}</span>
                <span className="kv-pcard-title text-[17px]">{t("title", { team })}</span>
                <span className="kv-pcard-price flex flex-wrap items-baseline gap-2">
                  <Price value={from} />
                  {full > from ? (
                    <span className="text-[12.5px] font-bold text-[#14713d]">
                      {t("youSave")} <Price value={full - from} />
                    </span>
                  ) : null}
                </span>
              </span>
            </Link>
          );
        })}
      </section>
    </Wrap>
  );
}
