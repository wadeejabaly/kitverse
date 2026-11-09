import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues, getTeams, getVisibleProducts, localName } from "@/data/catalog";
import { isRetroSeason, seasonYear } from "@/data/pricing";
import { slugify } from "@/data/slug";
import type { Kind, Product } from "@/data/types";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TeamFilterList } from "@/components/shop/TeamFilterList";
import { FilterGroup, FilterCheckbox } from "@/components/shop/FilterRail";
import { MobileFilters } from "@/components/shop/MobileFilters";
import { SortSelect } from "@/components/shop/SortSelect";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Season } from "@/components/shared/Money";
import { allParams, parseSort, shopHref, toggled } from "@/lib/shop-href";
import { sortProducts } from "@/lib/sort-products";
import { alternatesFor } from "@/lib/site";

const KINDS: Kind[] = ["national", "current", "previous"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/shop"),
  };
}

/**
 * Shop — the full catalogue with a filter rail, driven entirely by URL search
 * params so every filtered view is linkable and survives back/forward.
 *
 * Every facet is a checkbox group (2026-10-25, the owner's "let the filters
 * be checkboxes" ask), so it's multi-select: checking two leagues shows
 * products in EITHER (OR within a group), while checking a league and a team
 * still narrows to products matching BOTH (AND across groups — unchanged
 * from the single-select rail this replaced).
 *
 * Facet counts are cross-filtered: each group counts against the products
 * that pass the *other* groups (never itself), so the numbers describe what
 * ticking the next box would actually give you. Options that would lead to
 * zero results are dropped rather than shown greyed with a 0 — except any
 * already-checked option, which must stay visible so it can be unchecked.
 *
 * Note the league facet and the ~88 club products whose supplier data has no
 * league: they are simply absent from every league count and league listing,
 * and remain reachable by team and by season. A missing league is a data gap,
 * not a product that should disappear from the shop.
 */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("shop");

  const kinds = allParams(query.kind).filter((value) => KINDS.includes(value as Kind)) as Kind[];
  const leagueSlugs = new Set(getLeagues().map((entry) => entry.slug));
  const leagues = allParams(query.league).filter((value) => leagueSlugs.has(value));
  const teamSlugs = new Set(getTeams().map((entry) => entry.slug));
  const teams = allParams(query.team).filter((value) => teamSlugs.has(value));

  const all = getVisibleProducts();

  // Season/year (2026-10-25, the owner's "filter by year" ask) reads the
  // product's own `season` string ("2026/27", "2026") directly — distinct
  // from the `kind` facet above, which despite its translation key
  // ("Season" in the UI) actually groups national/current/previous, not a
  // specific year. The two are independent facets that happen to share an
  // English word; `seasonOptions` below is built from whatever distinct
  // values are actually in the catalog, not a fixed list, since the set
  // only grows as new stock and retro seasons arrive.
  const validSeasons = new Set(all.map((p) => p.season));
  const seasons = allParams(query.season).filter((value) => validSeasons.has(value));

  // The Retro / current-kit line (redesign phase 2 "Type: Fan, Player,
  // Retro" ask). Every non-retro shirt is sold in BOTH Fan and Player — it is
  // a choice on the product page, not a property of the shirt — so the only
  // real split in the catalogue is Retro vs not. The facet only shows when
  // both kinds are actually in stock.
  const lines = allParams(query.line).filter((value) => value === "retro" || value === "modern");
  const sort = parseSort(query.sort);

  const matchesKind = (product: Product) => kinds.length === 0 || kinds.includes(product.kind);
  const matchesLeague = (product: Product) =>
    leagues.length === 0 || (product.league !== null && leagues.includes(product.league));
  const matchesTeam = (product: Product) =>
    teams.length === 0 || teams.includes(slugify(product.team));
  const matchesSeason = (product: Product) => seasons.length === 0 || seasons.includes(product.season);
  const lineOf = (product: Product) => (isRetroSeason(product.season) ? "retro" : "modern");
  const matchesLine = (product: Product) => lines.length === 0 || lines.includes(lineOf(product));

  const results = sortProducts(
    all.filter(
      (product) =>
        matchesKind(product) &&
        matchesLeague(product) &&
        matchesTeam(product) &&
        matchesSeason(product) &&
        matchesLine(product),
    ),
    sort,
  );

  // Cross-filtered facet sets: everything except the facet being counted.
  const forKindFacet = all.filter((p) => matchesLeague(p) && matchesTeam(p) && matchesSeason(p) && matchesLine(p));
  const forLeagueFacet = all.filter((p) => matchesKind(p) && matchesTeam(p) && matchesSeason(p) && matchesLine(p));
  const forTeamFacet = all.filter((p) => matchesKind(p) && matchesLeague(p) && matchesSeason(p) && matchesLine(p));
  const forSeasonFacet = all.filter((p) => matchesKind(p) && matchesLeague(p) && matchesTeam(p) && matchesLine(p));
  const forLineFacet = all.filter((p) => matchesKind(p) && matchesLeague(p) && matchesTeam(p) && matchesSeason(p));
  const lineOptions = (["modern", "retro"] as const)
    .map((value) => ({ value, count: forLineFacet.filter((p) => lineOf(p) === value).length }))
    .filter((option) => option.count > 0 || lines.includes(option.value));
  const showLines = new Set(all.map(lineOf)).size > 1 || lines.length > 0;
  // Every filter link carries the current state, including the sort.
  const state = { kind: kinds, league: leagues, team: teams, season: seasons, line: lines, sort };

  const kindOptions = KINDS.map((value) => ({
    value,
    count: forKindFacet.filter((p) => p.kind === value).length,
  })).filter((option) => option.count > 0 || kinds.includes(option.value));

  const leagueOptions = getLeagues()
    .map((entry) => ({
      ...entry,
      count: forLeagueFacet.filter((p) => p.league === entry.slug).length,
    }))
    .filter((option) => option.count > 0 || leagues.includes(option.slug));

  const teamOptions = getTeams()
    .map((entry) => ({
      slug: entry.slug,
      name: localName(entry, locale),
      count: forTeamFacet.filter((p) => slugify(p.team) === entry.slug).length,
    }))
    .filter((option) => option.count > 0 || teams.includes(option.slug))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const seasonOptions = Array.from(validSeasons)
    .map((value) => ({
      value,
      count: forSeasonFacet.filter((p) => p.season === value).length,
    }))
    .filter((option) => option.count > 0 || seasons.includes(option.value))
    // Newest first — the same ordering a shopper would expect browsing
    // recent-to-old, and the direction `seasonYear()` already sorts for.
    .sort((a, b) => seasonYear(b.value) - seasonYear(a.value));

  const activeCount = kinds.length + leagues.length + teams.length + seasons.length + lines.length;
  const hasFilter = activeCount > 0;

  return (
    <Wrap>
      <PageLede
        eyebrow={t("eyebrow")}
        title={t("title")}
        intro={t("intro")}
        crumbs={[{ label: t("eyebrow") }]}
        art="/home/cat-clubs.webp"
      >
        <span className="kv-pagehero-stat">
          <strong className="latin">{all.length}</strong> {t("shirtsLabel")}
        </span>
      </PageLede>

      <section className="grid gap-6 pt-8 pb-[clamp(72px,10vw,120px)] wide:grid-cols-[250px_1fr] wide:gap-10 wide:pt-10">
        <MobileFilters active={activeCount}>
          <FilterGroup label={t("kind")}>
            {kindOptions.map((option) => (
              <FilterCheckbox
                key={option.value}
                href={shopHref({ ...state, kind: toggled(kinds, option.value) })}
                checked={kinds.includes(option.value)}
                label={t(`kinds.${option.value}`)}
                count={option.count}
              />
            ))}
          </FilterGroup>

          {showLines ? (
            <FilterGroup label={t("line")}>
              {lineOptions.map((option) => (
                <FilterCheckbox
                  key={option.value}
                  href={shopHref({ ...state, line: toggled(lines, option.value) })}
                  checked={lines.includes(option.value)}
                  label={t(`lines.${option.value}`)}
                  count={option.count}
                />
              ))}
            </FilterGroup>
          ) : null}

          <FilterGroup label={t("league")} id="league">
            {leagueOptions.map((option) => (
              <FilterCheckbox
                key={option.slug}
                href={shopHref({ ...state, league: toggled(leagues, option.slug) })}
                checked={leagues.includes(option.slug)}
                label={localName(option, locale)}
                count={option.count}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t("year")}>
            {seasonOptions.map((option) => (
              <FilterCheckbox
                key={option.value}
                href={shopHref({ ...state, season: toggled(seasons, option.value) })}
                checked={seasons.includes(option.value)}
                label={<Season value={option.value} />}
                count={option.count}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t("team")}>
            <TeamFilterList
              teams={teamOptions}
              selected={teams}
              basePath="/shop"
              otherParams={{ kind: kinds, league: leagues, season: seasons, line: lines, sort: sort === "featured" ? [] : [sort] }}
            />
          </FilterGroup>

          {hasFilter ? (
            <Link href={shopHref({ sort })} className="btn btn-quiet w-full">
              {t("clear")}
            </Link>
          ) : null}
        </MobileFilters>

        <div className="min-w-0">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            {/* Strings, not numbers: next-intl would format a number with the
                locale's own digits and render ٣ من ١٧ in Arabic. Latin
                numerals always. */}
            <span className="text-[14px] font-semibold text-ink">
              {t("showing", {
                count: String(results.length),
                total: String(all.length),
              })}
            </span>
            <SortSelect value={sort} />
          </div>

          {results.length > 0 ? (
            <ProductGrid
              products={results}
              locale={locale}
              columns={3}
              priorityCount={3}
              reveal
            />
          ) : (
            <div className="kv-panel px-6 py-14 text-center">
              <h2 className="kv-section-title mb-2.5">{t("emptyTitle")}</h2>
              <p className="mx-auto mb-6 max-w-[46ch] text-ink-soft">{t("emptyBody")}</p>
              <Link href={shopHref({})} className="btn">
                {t("clear")}
              </Link>
            </div>
          )}
        </div>
      </section>
    </Wrap>
  );
}
