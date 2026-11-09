import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { accessoriesByCategory } from "@/data/accessories";
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
    title: t("categoryTitle"),
    description: t("categoryMetaDescription"),
    alternates: alternatesFor(locale, "/accessories"),
  };
}

/**
 * Accessories — the category landing page (2026-10-25, "add an Accessories
 * category, keychains for now"). One flat row of category tiles, the same
 * hairline-and-fill vocabulary as every other listing on the site. Keychains
 * is the only one today; this page exists so a second accessory type later
 * (a scarf, a mini ball, whatever) has somewhere to land without the nav or
 * the URL structure changing.
 */
export default async function AccessoriesPage({
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
      <PageLede
        eyebrow={t("eyebrow")}
        title={t("categoryTitle")}
        intro={t("categoryIntro")}
        crumbs={[{ label: t("categoryTitle") }]}
        art="/home/cat-accessories.webp"
      />

      <section className="grid grid-cols-2 gap-5 pt-10 pb-[clamp(72px,10vw,120px)] sm:grid-cols-3 wide:grid-cols-4">
        <Link
          href="/accessories/keychains"
          className="kv-pcard group col-span-2 sm:col-span-1"
        >
          {keychains[0] ? (
            <span className="kv-pcard-media">
              <Image
                src={keychains[0].image}
                alt=""
                width={600}
                height={600}
                sizes="(max-width: 640px) 100vw, 300px"
                className="h-auto w-[80%] mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.05]"
              />
            </span>
          ) : null}
          <span className="kv-pcard-body">
            <span className="kv-pcard-team">
              {t("count", { count: keychains.length, countText: String(keychains.length) })}
            </span>
            <span className="kv-pcard-title text-[17px]">{t("keychainsLabel")}</span>
          </span>
        </Link>
      </section>
    </Wrap>
  );
}
