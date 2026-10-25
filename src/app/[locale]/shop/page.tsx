import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues, getTeams, getVisibleProducts } from "@/data/catalog";
import { seasonYear } from "@/data/pricing";
import { slugify } from "@/data/slug";
import type { Kind, Product } from "@/data/types";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TeamFilterList } from "@/components/shop/TeamFilterList";
import { FilterGroup, FilterCheckbox } from "@/components/shop/FilterRail";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Season } from "@/components/shared/Money";
import { allParams, shopHref, toggled } from "@/lib/shop-href";
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

  const matchesKind = (product: Product) => kinds.length === 0 || kinds.includes(product.kind);
  const matchesLeague = (product: Product) =>
    leagues.length === 0 || (product.league !== null && leagues.includes(product.league));
  const matchesTeam = (product: Product) =>
    teams.length === 0 || teams.includes(slugify(product.team));
  const matchesSeason = (product: Product) => seasons.length === 0 || seasons.includes(product.season);

  const results = all.filter(
    (product) =>
      matchesKind(product) &&
      matchesLeague(product) &&
      matchesTeam(product) &&
      matchesSeason(product),
  );

  // Cross-filtered facet sets: everything except the facet being counted.
  const forKindFacet = all.filter((p) => matchesLeague(p) && matchesTeam(p) && matchesSeason(p));
  const forLeagueFacet = all.filter((p) => matchesKind(p) && matchesTeam(p) && matchesSeason(p));
  const forTeamFacet = all.filter((p) => matchesKind(p) && matchesLeague(p) && matchesSeason(p));
  const forSeasonFacet = all.filter((p) => matchesKind(p) && matchesLeague(p) && matchesTeam(p));

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
      name: locale === "ar" ? entry.nameAr : entry.name,
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

  const hasFilter = kinds.length > 0 || leagues.length > 0 || teams.length > 0 || seasons.length > 0;

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

      <section className="grid gap-7 pt-10 pb-[clamp(72px,10vw,120px)] wide:grid-cols-[220px_1fr] wide:gap-14">
        <aside className="flex flex-col gap-9 self-start wide:sticky wide:top-28">
          <FilterGroup label={t("kind")}>
            {kindOptions.map((option) => (
              <FilterCheckbox
                key={option.value}
                href={shopHref({
                  kind: toggled(kinds, option.value),
                  league: leagues,
                  team: teams,
                  season: seasons,
                })}
                checked={kinds.includes(option.value)}
                label={t(`kinds.${option.value}`)}
                count={option.count}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t("league")} id="league">
            {leagueOptions.map((option) => (
              <FilterCheckbox
                key={option.slug}
                href={shopHref({
                  kind: kinds,
                  league: toggled(leagues, option.slug),
                  team: teams,
                  season: seasons,
                })}
                checked={leagues.includes(option.slug)}
                label={locale === "ar" ? option.nameAr : option.name}
                count={option.count}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t("year")}>
            {seasonOptions.map((option) => (
              <FilterCheckbox
                key={option.value}
                href={shopHref({
                  kind: kinds,
                  league: leagues,
                  team: teams,
                  season: toggled(seasons, option.value),
                })}
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
              otherParams={{ kind: kinds, league: leagues, season: seasons }}
            />
          </FilterGroup>

          {hasFilter ? (
            <Link
              href={shopHref({})}
              className="text-start text-sm text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {t("clear")}
            </Link>
          ) : null}
        </aside>

        <div>
          <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-rule pb-4">
            {/* Strings, not numbers: next-intl would format a number with the
                locale's own digits and render ٣ من ١٧ in Arabic. Latin
                numerals always. Bare integers need no bidi isolation — they
                are weak-LTR and sit correctly inside Arabic text. */}
            <span className="mono-eyebrow text-ink-soft">
              {t("showing", {
                count: String(results.length),
                total: String(all.length),
              })}
            </span>
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
            <div className="py-14">
              <h2 className="mb-2.5 text-xl">{t("emptyTitle")}</h2>
              <p className="mb-6 max-w-[46ch] text-ink-soft">{t("emptyBody")}</p>
              <Link href={shopHref({})} className="btn btn-quiet">
                {t("clear")}
              </Link>
            </div>
          )}
        </div>
      </section>
    </Wrap>
  );
}
