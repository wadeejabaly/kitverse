import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/config";
import { getTeams, localName } from "@/data/catalog";
import { seasonYear } from "@/data/pricing";
import { slugify } from "@/data/slug";
import type { Product } from "@/data/types";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TeamFilterList } from "@/components/shop/TeamFilterList";
import { FilterGroup, FilterCheckbox } from "@/components/shop/FilterRail";
import { MobileFilters } from "@/components/shop/MobileFilters";
import { SortSelect } from "@/components/shop/SortSelect";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Season } from "@/components/shared/Money";
import { collectionParams, resolveCollection, type Collection } from "@/lib/collections";
import { allParams, collectionHref, parseSort, shopHref, toggled } from "@/lib/shop-href";
import { sortProducts } from "@/lib/sort-products";
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
 * by team or year" ask), as checkboxes (2026-10-25, same day — "let the
 * filters be checkboxes"): a league/kind/retro collection gets both facets,
 * each multi-select; a team collection only gets Year, since it is already
 * exactly one team and a "Team" rail with a single option would be
 * pointless. Sleeve length was also asked for but is deliberately skipped —
 * the catalog has no sleeve data for any product, and the owner chose
 * team+year only rather than adding a defaulted field.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    collectionParams().map((collection) => ({ locale, collection })),
  );
}

function collectionName(collection: Collection, locale: string, t: (key: string) => string) {
  if (collection.type === "kind") return t(`kinds.${collection.kind}`);
  if (collection.type === "retro") return t("kinds.retro");
  return localName(collection, locale);
}

/** The generated photo for a collection's page hero (public/home/cat-*.webp,
 *  built from real catalog photos — see category-images.ts). A team page
 *  gets the plain stadium band: there is no photo of every club. */
function collectionArt(collection: Collection): string | undefined {
  if (collection.type === "retro") return "/home/cat-retro.webp";
  if (collection.type === "kind") {
    return collection.kind === "national" ? "/home/cat-national.webp" : "/home/cat-clubs.webp";
  }
  if (collection.type === "league") return "/home/cat-clubs.webp";
  return undefined;
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

  const teamSlugs = new Set(getTeams().map((entry) => entry.slug));
  const teams = showTeamFilter ? allParams(query.team).filter((value) => teamSlugs.has(value)) : [];

  const validSeasons = new Set(all.map((entry) => entry.season));
  const seasons = allParams(query.season).filter((value) => validSeasons.has(value));

  const matchesTeam = (product: Product) =>
    teams.length === 0 || teams.includes(slugify(product.team));
  const matchesSeason = (product: Product) => seasons.length === 0 || seasons.includes(product.season);

  const sort = parseSort(query.sort);
  const results = sortProducts(
    all.filter((product) => matchesTeam(product) && matchesSeason(product)),
    sort,
  );

  // Cross-filtered facet sets: everything except the facet being counted.
  const forTeamFacet = all.filter((p) => matchesSeason(p));
  const forSeasonFacet = all.filter((p) => matchesTeam(p));

  const teamOptions = showTeamFilter
    ? getTeams()
        .map((entry) => ({
          slug: entry.slug,
          name: localName(entry, locale),
          count: forTeamFacet.filter((p) => slugify(p.team) === entry.slug).length,
        }))
        .filter((option) => option.count > 0 || teams.includes(option.slug))
        .sort((a, b) => a.name.localeCompare(b.name, locale))
    : [];

  const seasonOptions = Array.from(validSeasons)
    .map((value) => ({
      value,
      count: forSeasonFacet.filter((p) => p.season === value).length,
    }))
    .filter((option) => option.count > 0 || seasons.includes(option.value))
    // Newest first, same as the main shop page's identical facet.
    .sort((a, b) => seasonYear(b.value) - seasonYear(a.value));

  const hasFilter = teams.length > 0 || seasons.length > 0;
  const hasAnyFilterableFacet = (showTeamFilter && teamOptions.length > 0) || seasonOptions.length > 1;
  const crumbs = [{ label: t("eyebrow"), href: "/shop" }, { label: name }];

  return (
    <Wrap>
      <PageLede eyebrow={eyebrow} title={name} intro={t("intro")} crumbs={crumbs} art={collectionArt(collection)}>
        <span className="kv-pagehero-stat">
          <strong className="latin">{all.length}</strong> {t("shirtsLabel")}
        </span>
      </PageLede>

      <section
        className={
          hasAnyFilterableFacet
            ? "grid gap-6 pt-8 pb-14 wide:grid-cols-[250px_1fr] wide:gap-10 wide:pt-10"
            : "pt-8 pb-14 wide:pt-10"
        }
      >
        {hasAnyFilterableFacet ? (
          <MobileFilters active={teams.length + seasons.length}>
            {seasonOptions.length > 1 ? (
              <FilterGroup label={t("year")}>
                {seasonOptions.map((option) => (
                  <FilterCheckbox
                    key={option.value}
                    href={collectionHref(slug, {
                      team: teams,
                      season: toggled(seasons, option.value),
                      sort,
                    })}
                    checked={seasons.includes(option.value)}
                    label={<Season value={option.value} />}
                    count={option.count}
                  />
                ))}
              </FilterGroup>
            ) : null}

            {showTeamFilter && teamOptions.length > 0 ? (
              <FilterGroup label={t("team")}>
                <TeamFilterList
                  teams={teamOptions}
                  selected={teams}
                  basePath={`/shop/${slug}`}
                  otherParams={{ season: seasons, sort: sort === "featured" ? [] : [sort] }}
                />
              </FilterGroup>
            ) : null}

            {hasFilter ? (
              <Link href={collectionHref(slug, { sort })} className="btn btn-quiet w-full">
                {t("clear")}
              </Link>
            ) : null}
          </MobileFilters>
        ) : null}

        <div className="min-w-0">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            {/* Strings, not numbers — see the identical note on /shop. */}
            <span className="text-[14px] font-semibold text-ink">
              {hasFilter
                ? t("showing", { count: String(results.length), total: String(all.length) })
                : t("count", {
                    count: all.length,
                    countText: String(all.length),
                  })}
            </span>
            {all.length > 1 ? <SortSelect value={sort} /> : null}
          </div>

          {results.length > 0 ? (
            <ProductGrid
              products={results}
              locale={locale}
              columns={hasAnyFilterableFacet ? 3 : 4}
              priorityCount={4}
              reveal
            />
          ) : (
            <div className="kv-panel px-6 py-14 text-center">
              <h2 className="kv-section-title mb-2.5">{all.length === 0 ? t("comingSoonTitle") : t("emptyTitle")}</h2>
              <p className="mx-auto mb-6 max-w-[46ch] text-ink-soft">
                {all.length === 0 ? t("comingSoonBody") : t("emptyBody")}
              </p>
              <Link href={all.length === 0 ? shopHref({}) : `/shop/${slug}`} className="btn">
                {all.length === 0 ? t("browseAll") : t("clear")}
              </Link>
            </div>
          )}
        </div>
      </section>
    </Wrap>
  );
}
