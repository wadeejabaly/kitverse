import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLeagues, getTeams, getVisibleProducts } from "@/data/catalog";
import { slugify } from "@/data/slug";
import type { Kind, Product } from "@/data/types";
import { ProductGrid } from "@/components/shop/ProductCard";
import { TeamSelect } from "@/components/shop/TeamSelect";
import { Figure } from "@/components/shared/Money";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { firstParam, shopHref } from "@/lib/shop-href";
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
 * Facet counts are cross-filtered: each group counts against the products that
 * pass the *other* groups, so the numbers describe what clicking would
 * actually give you. Options that would lead to zero results are dropped
 * rather than shown greyed with a 0 — except the currently selected one, which
 * must stay visible so it can be switched off.
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

  const kindParam = firstParam(query.kind);
  const kind = KINDS.includes(kindParam as Kind) ? (kindParam as Kind) : null;
  const leagueParam = firstParam(query.league);
  const league = getLeagues().some((entry) => entry.slug === leagueParam)
    ? leagueParam
    : null;
  const teamParam = firstParam(query.team);
  const team = getTeams().some((entry) => entry.slug === teamParam) ? teamParam : null;

  const all = getVisibleProducts();

  const matchesKind = (product: Product) => kind === null || product.kind === kind;
  const matchesLeague = (product: Product) =>
    league === null || product.league === league;
  const matchesTeam = (product: Product) =>
    team === null || slugify(product.team) === team;

  const results = all.filter(
    (product) => matchesKind(product) && matchesLeague(product) && matchesTeam(product),
  );

  // Cross-filtered facet sets: everything except the facet being counted.
  const forKindFacet = all.filter((p) => matchesLeague(p) && matchesTeam(p));
  const forLeagueFacet = all.filter((p) => matchesKind(p) && matchesTeam(p));
  const forTeamFacet = all.filter((p) => matchesKind(p) && matchesLeague(p));

  const kindOptions = KINDS.map((value) => ({
    value,
    count: forKindFacet.filter((p) => p.kind === value).length,
  })).filter((option) => option.count > 0 || option.value === kind);

  const leagueOptions = getLeagues()
    .map((entry) => ({
      ...entry,
      count: forLeagueFacet.filter((p) => p.league === entry.slug).length,
    }))
    .filter((option) => option.count > 0 || option.slug === league);

  const teamOptions = getTeams()
    .map((entry) => ({
      slug: entry.slug,
      name: locale === "ar" ? entry.nameAr : entry.name,
      count: forTeamFacet.filter((p) => slugify(p.team) === entry.slug).length,
    }))
    .filter((option) => option.count > 0 || option.slug === team)
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const hasFilter = kind !== null || league !== null || team !== null;

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

      <section className="grid gap-7 pt-8 pb-14 wide:grid-cols-[230px_1fr] wide:gap-11">
        <aside className="flex flex-col gap-6 self-start wide:sticky wide:top-24">
          <FilterGroup label={t("kind")}>
            <FilterLink
              href={shopHref({ league, team })}
              active={kind === null}
              label={t("all")}
              count={forKindFacet.length}
            />
            {kindOptions.map((option) => (
              <FilterLink
                key={option.value}
                href={shopHref({
                  kind: kind === option.value ? null : option.value,
                  league,
                  team,
                })}
                active={kind === option.value}
                label={t(`kinds.${option.value}`)}
                count={option.count}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t("league")} id="league">
            <FilterLink
              href={shopHref({ kind, team })}
              active={league === null}
              label={t("all")}
              count={forLeagueFacet.length}
            />
            {leagueOptions.map((option) => (
              <FilterLink
                key={option.slug}
                href={shopHref({
                  kind,
                  league: league === option.slug ? null : option.slug,
                  team,
                })}
                active={league === option.slug}
                label={locale === "ar" ? option.nameAr : option.name}
                count={option.count}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t("team")}>
            <TeamSelect
              teams={teamOptions}
              selected={team}
              kind={kind}
              league={league}
              label={t("team")}
              allLabel={t("allTeams")}
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

function FilterGroup({
  label,
  id,
  children,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-28">
      <span className="mono-eyebrow mb-2.5 block text-ink-soft">{label}</span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/**
 * One facet option. A link, not a button: the filter is a URL, so it should
 * be openable in a new tab and crawlable like any other listing.
 */
function FilterLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`flex justify-between gap-2.5 text-start text-sm transition-colors ${
        active ? "text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      <span>
        {active ? <span aria-hidden className="me-2">—</span> : null}
        {label}
      </span>
      <span className="mono-eyebrow latin text-ink-soft">
        <Figure>{count}</Figure>
      </span>
    </Link>
  );
}
