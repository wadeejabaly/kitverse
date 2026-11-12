import { byKind, getLeagues, getTeams, getVisibleProducts, retroProducts, type Team } from "@/data/catalog";
import { slugify } from "@/data/slug";
import type { Product } from "@/data/types";
import { localName } from "@/lib/local-name";
import { collectionHref, shopHref } from "@/lib/shop-href";

/**
 * The header's menu content (owner request 2026-11-12, "reorganize the header navigation"), built
 * ONLY from the existing catalog data and routes - no new categories, no placeholder pages:
 *   - leagues      -> /shop/<league>, each with its clubs -> /shop/<team>
 *   - national     -> /shop/<team> for every national team with a visible shirt
 *   - classics     -> /shop/retro, /shop/retro?team=<team>, /shop?line=retro&league=<league>|&kind=national
 * Plain, serializable data so the server Header and the client menus share one source.
 */

export interface NavLink {
  href: string;
  label: string;
  /** A plain <a>, not the locale-aware <Link> - for /o/track, which lives outside the [locale] routes. */
  plain?: boolean;
}

export interface NavColumn {
  /** Column heading - a link itself when it has an href (a league), a plain label otherwise. */
  heading?: { label: string; href?: string };
  links: NavLink[];
  /** Desktop only: flow this column's links into N text columns (the 46 national teams). */
  flow?: number;
}

export interface NavPanel {
  /** mega = spans the header width (leagues, national teams, classics); compact = hangs under its trigger. */
  layout: "mega" | "compact";
  columns: NavColumn[];
  /** The "see everything" link at the bottom of the panel. */
  cta?: NavLink;
}

/** One of the six top-level header entries. */
export interface NavEntry {
  id: string;
  label: string;
  /** Where the label itself goes; none for "More", which is only a group. */
  href?: string;
  /** Path prefixes that mark this entry as the current section. */
  match?: string[];
  panel?: NavPanel;
}

/** The order the owner listed the leagues in; any other league follows. */
const LEAGUE_ORDER = ["premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"];

const teamBySlug = () => new Map(getTeams().map((team) => [team.slug, team]));

/** Distinct teams of these products, in catalogue order (the catalogue lists the big clubs first). */
function teamsOf(products: Product[], teams: Map<string, Team>): Team[] {
  const seen = new Set<string>();
  const out: Team[] = [];
  for (const product of products) {
    const slug = slugify(product.team);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const team = teams.get(slug);
    if (team) out.push(team);
  }
  return out;
}

function orderedLeagues() {
  return [...getLeagues()].sort((a, b) => {
    const ia = LEAGUE_ORDER.indexOf(a.slug);
    const ib = LEAGUE_ORDER.indexOf(b.slug);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/** Leagues, each with the clubs that have a visible shirt. */
export function leagueColumns(locale: string): NavColumn[] {
  const teams = teamBySlug();
  const visible = getVisibleProducts();
  return orderedLeagues().map((league) => ({
      heading: { href: `/shop/${league.slug}`, label: localName(league, locale) },
    links: teamsOf(visible.filter((p) => p.league === league.slug), teams).map((team) => ({
      href: `/shop/${team.slug}`,
      label: localName(team, locale),
    })),
  }));
}

/** Every national team with a visible shirt, alphabetical in the page's language. */
export function nationalTeamLinks(locale: string): NavLink[] {
  const collator = new Intl.Collator(locale);
  return teamsOf(byKind("national"), teamBySlug())
    .map((team) => ({ href: `/shop/${team.slug}`, label: localName(team, locale) }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

export interface ClassicsMenu {
  /** Retro by league (only leagues that have a retro shirt) + retro national teams when there are any. */
  byLeague: NavLink[];
  /** Clubs and nations with the most retro shirts, up to 12. */
  teams: NavLink[];
}

export function classicsMenu(locale: string, labels: { nationalTeams: string }): ClassicsMenu {
  const retro = retroProducts();
  const leagues = orderedLeagues()
    .filter((league) => retro.some((p) => p.league === league.slug))
    .map((league) => ({ href: shopHref({ line: ["retro"], league: [league.slug] }), label: localName(league, locale) }));
  if (retro.some((p) => p.kind === "national")) {
    leagues.push({ href: shopHref({ line: ["retro"], kind: ["national"] }), label: labels.nationalTeams });
  }
  const counts = new Map<string, number>();
  for (const p of retro) counts.set(slugify(p.team), (counts.get(slugify(p.team)) ?? 0) + 1);
  const teams = teamsOf(retro, teamBySlug())
    .sort((a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0))
    .slice(0, 12)
    .map((team) => ({ href: collectionHref("retro", { team: [team.slug] }), label: localName(team, locale) }));
  return { byLeague: leagues, teams };
}

export interface NavLabels {
  shop: string; nationalTeams: string; retro: string; leagues: string; accessories: string; more: string;
  allNationalTeams: string; allClassics: string; classicsByLeague: string; classicsTeams: string; allAccessories: string;
  keychains: string; scarves: string; sizeGuide: string; trackOrder: string; about: string; contact: string;
}

/** The six header entries in the owner's order: Shop, National teams, Classics, Leagues, Accessories, More. */
export function buildNav(locale: string, t: NavLabels): NavEntry[] {
  const leagues = leagueColumns(locale);
  const classics = classicsMenu(locale, { nationalTeams: t.nationalTeams });
  const classicsColumns: NavColumn[] = [];
  if (classics.byLeague.length) classicsColumns.push({ heading: { label: t.classicsByLeague }, links: classics.byLeague });
  if (classics.teams.length) classicsColumns.push({ heading: { label: t.classicsTeams }, links: classics.teams, flow: 2 });
  return [
    { id: "shop", label: t.shop, href: "/shop", match: ["/shop$"] },
    {
      id: "national", label: t.nationalTeams, href: "/shop/national-teams", match: ["/shop/national-teams"],
      panel: { layout: "mega", columns: [{ links: nationalTeamLinks(locale), flow: 5 }], cta: { href: "/shop/national-teams", label: t.allNationalTeams } },
    },
    {
      id: "classics", label: t.retro, href: "/shop/retro", match: ["/shop/retro"],
      panel: { layout: classicsColumns.length ? "mega" : "compact", columns: classicsColumns, cta: { href: "/shop/retro", label: t.allClassics } },
    },
    {
      id: "leagues", label: t.leagues, href: "/shop#league", match: leagues.map((c) => c.heading?.href ?? "").filter(Boolean),
      panel: { layout: "mega", columns: leagues },
    },
    {
      id: "accessories", label: t.accessories, href: "/accessories", match: ["/accessories"],
      panel: {
        layout: "compact",
        columns: [{ links: [{ href: "/accessories/scarves", label: t.scarves }, { href: "/accessories/keychains", label: t.keychains }] }],
        cta: { href: "/accessories", label: t.allAccessories },
      },
    },
    {
      id: "more", label: t.more, match: ["/size-guide", "/about", "/contact"],
      panel: {
        layout: "compact",
        columns: [{ links: [
          { href: "/size-guide", label: t.sizeGuide },
          { href: "/o/track", label: t.trackOrder, plain: true },
          { href: "/about", label: t.about },
          { href: "/contact", label: t.contact },
        ] }],
      },
    },
  ];
}
