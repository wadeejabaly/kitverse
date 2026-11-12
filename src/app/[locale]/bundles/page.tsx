import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { availableBundles, BUNDLE_VERSION } from "@/data/bundles";
import { priceFor } from "@/data/pricing";
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

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("listTitle")} intro={t("listIntro")} crumbs={[{ label: t("listTitle") }]} />
      <section className="grid gap-5 pt-10 pb-[clamp(72px,10vw,120px)] sm:grid-cols-2">
        {bundles.map(({ bundle, products }) => {
          const team = bundleTeam(products[0], locale);
          const from = products.reduce((s, p) => s + priceFor(p.season, "M", BUNDLE_VERSION), 0);
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
                <span className="kv-pcard-price">
                  <Price value={from} />
                </span>
              </span>
            </Link>
          );
        })}
      </section>
    </Wrap>
  );
}
