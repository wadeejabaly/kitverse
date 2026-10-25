import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/config";
import { getTeams } from "@/data/catalog";
import { seasonYear } from "@/data/pricing";
import { slugify } from "@/data/slug";
import type { Product } from "@/data/types";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TeamSelect } from "@/components/shop/TeamSelect";
import { FilterGroup, FilterLink } from "@/components/shop/FilterRail";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Season } from "@/components/shared/Money";
import { collectionParams, resolveCollection, type Collection } from "@/lib/collections";
import { collectionHref, firstParam, shopHref } from "@/lib/shop-href";
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
 *
 * Team + Year filter rail (2026-10-25, the owner's "filter each sub-category
 * by team or year" ask): a league/kind/retro collection gets both facets; a
 * team collection only gets Year, since it is already exactly one team and a
 * "Team" rail with a single option would be pointless. Sleeve length was also
 * asked for but is deliberately skipped — the catalog has no sleeve data for
 * any product, and the owner chose team+year only rather than adding a
 * defaulted field.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    collectionParams().map((collection) => ({ locale, collection })),
  );
}

function collectionName(collection: Collection, locale: string, t: (key: string) => string) {
  if (collection.type === "kind") return t(`kinds.${collection.kind}`);
  if (collection.type === "retro") return t("kinds.retro");
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
  searchParams,
}: {
  params: Promise<{ locale: string; collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
        : collection.type === "retro"
          ? t("category")
          : t("kind");

  const query = await searchParams;
  const all = collection.products;

  // A team collection is already exactly one team — no Team rail for it.
  const showTeamFilter = collection.type !== "team";

  const teamParam = firstParam(query.team);
  const team =
    showTeamFilter && getTeams().some((entry) => entry.slug === teamParam) ? teamParam : null;

  const seasonParam = firstParam(query.season);
  const season = all.some((entry) => entry.season === seasonParam) ? seasonParam : null;

  const matchesTeam = (product: Product) => team === null || slugify(product.team) === team;
  const matchesSeason = (product: Product) => season === null || product.season === season;

  const results = all.filter((product) => matchesTeam(product) && matchesSeason(product));

  // Cross-filtered facet sets: everything except the facet being counted.
  const forTeamFacet = all.filter((p) => matchesSeason(p));
  const forSeasonFacet = all.filter((p) => matchesTeam(p));

  const teamOptions = showTeamFilter
    ? getTeams()
        .map((entry) => ({
          slug: entry.slug,
          name: locale === "ar" ? entry.nameAr : entry.name,
          count: forTeamFacet.filter((p) => slugify(p.team) === entry.slug).length,
        }))
        .filter((option) => option.count > 0 || option.slug === team)
        .sort((a, b) => a.name.localeCompare(b.name, locale))
    : [];

  const seasonOptions = Array.from(new Set(all.map((p) => p.season)))
    .map((value) => ({
      value,
      count: forSeasonFacet.filter((p) => p.season === value).length,
    }))
    .filter((option) => option.count > 0 || option.value === season)
    // Newest first, same as the main shop page's identical facet.
    .sort((a, b) => seasonYear(b.value) - seasonYear(a.value));

  const hasFilter = team !== null || season !== null;
  const hasAnyFilterableFacet = showTeamFilter || seasonOptions.length > 1;

  return (
    <Wrap>
      <PageLede eyebrow={eyebrow} title={name} intro={t("intro")} />

      <section
        className={
          hasAnyFilterableFacet
            ? "grid gap-7 pt-8 pb-14 wide:grid-cols-[220px_1fr] wide:gap-14"
            : "pt-8 pb-14"
        }
      >
        {hasAnyFilterableFacet ? (
          <aside className="flex flex-col gap-9 self-start wide:sticky wide:top-28">
            <FilterGroup label={t("year")}>
              <FilterLink
                href={collectionHref(slug, { team })}
                active={season === null}
                label={t("all")}
                count={forSeasonFacet.length}
              />
              {seasonOptions.map((option) => (
                <FilterLink
                  key={option.value}
                  href={collectionHref(slug, {
                    team,
                    season: season === option.value ? null : option.value,
                  })}
                  active={season === option.value}
                  label={<Season value={option.value} />}
                  count={option.count}
                />
              ))}
            </FilterGroup>

            {showTeamFilter ? (
              <FilterGroup label={t("team")}>
                <TeamSelect
                  teams={teamOptions}
                  selected={team}
                  basePath={`/shop/${slug}`}
                  otherParams={{ season }}
                  label={t("team")}
                  allLabel={t("allTeams")}
                />
              </FilterGroup>
            ) : null}

            {hasFilter ? (
              <Link
                href={`/shop/${slug}`}
                className="text-start text-sm text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                {t("clear")}
              </Link>
            ) : null}
          </aside>
        ) : null}

        <div>
          <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-rule pb-4">
            {/* Strings, not numbers — see the identical note on /shop. */}
            <span className="mono-eyebrow text-ink-soft">
              {hasFilter
                ? t("showing", { count: String(results.length), total: String(all.length) })
                : t("count", {
                    count: all.length,
                    countText: String(all.length),
                  })}
            </span>
            <Link
              href={shopHref({})}
              className="mono-eyebrow text-ink-soft transition-colors hover:text-ink"
            >
              {t("eyebrow")}
            </Link>
          </div>

          {results.length > 0 ? (
            <ProductGrid products={results} locale={locale} priorityCount={4} reveal />
          ) : (
            <div className="py-14">
              <h2 className="mb-2.5 text-xl">{t("emptyTitle")}</h2>
              <p className="mb-6 max-w-[46ch] text-ink-soft">{t("emptyBody")}</p>
              <Link href={`/shop/${slug}`} className="btn btn-quiet">
                {t("clear")}
              </Link>
            </div>
          )}
        </div>
      </section>
    </Wrap>
  );
}
