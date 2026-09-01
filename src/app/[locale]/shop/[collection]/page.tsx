import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/config";
import { ProductGrid } from "@/components/shop/ProductCard";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { collectionParams, resolveCollection, type Collection } from "@/lib/collections";
import { shopHref } from "@/lib/shop-href";
import { alternatesFor } from "@/lib/site";

/**
 * Collection listings: /shop/premier-league, /shop/national-teams,
 * /shop/arsenal. One flat slug space over three collection types, resolved in
 * src/lib/collections.ts.
 *
 * Params are pre-rendered for the season groups, every league, and every team
 * that currently has an approved product — but the page renders for any valid
 * slug, so a team whose photos clear review later works immediately without a
 * rebuild, showing its own empty state until then.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    collectionParams().map((collection) => ({ locale, collection })),
  );
}

function collectionName(collection: Collection, locale: string, t: (key: string) => string) {
  if (collection.type === "kind") return t(`kinds.${collection.kind}`);
  return locale === "ar" ? collection.nameAr : collection.name;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}): Promise<Metadata> {
  const { locale, collection: slug } = await params;
  const collection = resolveCollection(slug);
  if (!collection) return {};
  const t = await getTranslations({ locale, namespace: "shop" });
  const name = collectionName(collection, locale, t);
  return {
    title: name,
    description: t("metaDescription"),
    alternates: alternatesFor(locale, `/shop/${slug}`),
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}) {
  const { locale, collection: slug } = await params;
  setRequestLocale(locale);

  const collection = resolveCollection(slug);
  if (!collection) notFound();

  const t = await getTranslations("shop");
  const name = collectionName(collection, locale, t);
  const eyebrow =
    collection.type === "league"
      ? t("league")
      : collection.type === "team"
        ? t("team")
        : t("kind");

  return (
    <Wrap>
      <PageLede eyebrow={eyebrow} title={name} intro={t("intro")} />

      <section className="pt-8 pb-14">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-rule pb-4">
          <span className="mono-eyebrow text-ink-soft">
            {t("count", {
              count: collection.products.length,
              countText: String(collection.products.length),
            })}
          </span>
          <Link
            href={shopHref({})}
            className="mono-eyebrow text-ink-soft transition-colors hover:text-ink"
          >
            {t("eyebrow")}
          </Link>
        </div>

        {collection.products.length > 0 ? (
          <ProductGrid products={collection.products} locale={locale} priorityCount={4} />
        ) : (
          <div className="py-14">
            <h2 className="mb-2.5 text-xl">{t("emptyTitle")}</h2>
            <p className="mb-6 max-w-[46ch] text-ink-soft">{t("emptyBody")}</p>
            <Link href={shopHref({})} className="btn btn-quiet">
              {t("clear")}
            </Link>
          </div>
        )}
      </section>
    </Wrap>
  );
}
