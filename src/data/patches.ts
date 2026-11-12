import { hasUclTitlesBadge, isClubWorldChampionSeason, uclFinalPrint, uclRespectOffered, uclStarballOffered } from "@/lib/patch-eligibility";
import { slugify } from "./slug";
import type { Kind } from "./types";
import type { PatchId } from "@/lib/orders/rules";
import { allowedPatchesFor, maxPatches } from "@/lib/patch-limits";

/**
 * The storefront's patch picker (owner ask 2026-10-26): a small photo per
 * patch, so a shopper picks from what the patch actually looks like rather
 * than a plain-text dropdown. This is a PRESENTATION layer over
 * lib/orders/rules.ts's `PATCHES` — the single source of truth for which
 * patch ids exist and which team type each is for. Not every id in
 * `PATCHES` has artwork yet (`club_world_cup` is still bot/DM-only), so
 * `patchOptionsFor()` only ever returns ids we have a photo for.
 */
export interface PatchOption {
  id: PatchId;
  image: string; // "/patches/xxx.jpg"
  /** Message key under the "product" i18n namespace, e.g. t(option.labelKey). */
  labelKey: string;
}

/**
 * Champions League art is per-club (a trophy-count badge for the clubs the
 * owner supplied art for; every other club gets the general design) — one
 * patch CONCEPT, swapped artwork, not several options.
 */
const CLUB_WORLD_CHAMPIONS_ART = "/patches/club-world-champions.jpg";
const UCL_RESPECT_ART = "/patches/ucl-respect.jpg";
const CHAMPIONS_LEAGUE_ART: Record<string, string> = {
  "ac-milan": "/patches/champions-league-ac-milan.jpg",
  "ajax": "/patches/champions-league-ajax.jpg",
  "barcelona": "/patches/champions-league-barcelona.jpg",
  "bayern-munich": "/patches/champions-league-bayern-munich.jpg",
  "liverpool": "/patches/champions-league-liverpool.jpg",
  "real-madrid": "/patches/champions-league-real-madrid.jpg",
};
const CHAMPIONS_LEAGUE_GENERAL = "/patches/champions-league-general.jpg";

/**
 * Leagues we have the club's own league-patch artwork for today. A league
 * missing here (Bundesliga, Ligue 1, …) simply offers no "league" photo
 * option on the storefront — checkPatches() still allows the bot to add one
 * over Instagram; this is only about what we can show a picture of.
 */
const LEAGUE_ART: Record<string, string> = {
  "la-liga": "/patches/league-la-liga.jpg",
  "premier-league": "/patches/league-premier-league.jpg",
  "serie-a": "/patches/league-serie-a.jpg",
};

/**
 * Period-correct artwork for a product with its own patch list
 * (PRODUCT_PATCHES in src/lib/patch-limits.ts): Barcelona 2008/09 wore the
 * old LFP league badge and the plain Champions League starball.
 * `null` = no photo yet: the picker leaves that option out (the bot can still
 * take it over Instagram). The old LFP badge photo is still to come from the
 * owner - add it as public/patches/league-la-liga-lfp.jpg and set it here.
 */
const PRODUCT_PATCH_ART: Record<string, Partial<Record<PatchId, string | null>>> = {
  "barcelona-2008-retro-home-shirt": {
    league: null,
    champions_league: CHAMPIONS_LEAGUE_GENERAL,
  },
};

const EUROPA_LEAGUE_ART = "/patches/europa-league.jpg";
const COPPA_ITALIA_ART = "/patches/coppa-italia.jpg";
const WORLD_CUP_ART = "/patches/world-cup.jpg";
const WORLD_CUP_CHAMPIONS_ART = "/patches/world-cup-champions.jpg";
const WORLD_CUP_PEACE_ART = "/patches/world-cup-peace.jpg";

/**
 * id → the cart/checkout "cart" namespace message key for its prop row —
 * used wherever a cart line is DISPLAYED (not where it's picked, which goes
 * through `patchOptionsFor` above). `club_world_cup` has no storefront photo
 * and can never be added from here, so it falls back to the Champions
 * League row rather than needing a message key no one will ever see.
 */
export const PATCH_PROP_KEYS: Record<PatchId, string> = {
  league: "propPatchLeague",
  champions_league: "propPatchChampionsLeague",
  champions_league_full: "propPatchChampionsLeagueFull",
  europa_league: "propPatchEuropaLeague",
  club_world_cup: "propPatchClubWorldChampions",
  ucl_final_print: "propPatchFinalPrint",
  ucl_titles_badge: "propPatchUclTitlesBadge",
  ucl_respect: "propPatchUclRespect",
  coppa_italia: "propPatchCoppaItalia",
  world_cup: "propPatchWorldCup",
  world_cup_peace: "propPatchWorldCupPeace",
  world_cup_champions: "propPatchWorldCupChampions",
};

/**
 * A club shirt takes at most 2 patches (one per sleeve), a national shirt up
 * to 3 - except La Liga 2025/26 and 2026/27, only 1. Same rule as
 * checkPatches() / sanitizePatches(): src/lib/patch-limits.ts.
 */
export function maxPatchesFor(product: { league: string | null; kind: Kind; season?: string | null; handle?: string | null }): number {
  return maxPatches({
    handle: product.handle,
    type: product.league !== null ? "club" : product.kind === "national" ? "national" : null,
    leagueId: product.league,
    season: product.season,
  });
}

/**
 * The patches a product offers in the image picker, in display order. Empty
 * for a product that is neither a club shirt nor a national-team shirt.
 */
export function patchOptionsFor(product: {
  league: string | null;
  kind: Kind;
  team: string;
  season?: string | null;
  handle?: string | null;
}): PatchOption[] {
  const only = allowedPatchesFor(product.handle);
  if (only) {
    const art = PRODUCT_PATCH_ART[product.handle ?? ""] ?? {};
    return patchOptionsFor({ ...product, handle: null })
      .filter((o) => only.includes(o.id) && art[o.id] !== null)
      .map((o) => (art[o.id] ? { ...o, image: art[o.id]! } : o));
  }
  if (product.league !== null) {
    const options: PatchOption[] = [];
    const leagueArt = LEAGUE_ART[product.league];
    if (leagueArt) options.push({ id: "league", image: leagueArt, labelKey: "patchLeague" });
    const teamSlug = slugify(product.team);
    // owner request 2026-11-12 ("remove the all-inclusive"): every Champions League piece on its own, 1 patch
    // each - the starball, the titles badge (trophy with the number of wins, only clubs that have one; it uses
    // the club's numbered artwork) and the Respect patch that sits under it. No more "full version" option.
    // current shirts (owner request 2026-11-12): starball only for clubs without a titles badge, no Respect
    if (uclStarballOffered(teamSlug, product.season)) {
      options.push({ id: "champions_league", image: CHAMPIONS_LEAGUE_GENERAL, labelKey: "patchChampionsLeague" });
    }
    const titlesArt = CHAMPIONS_LEAGUE_ART[teamSlug];
    if (titlesArt && hasUclTitlesBadge(teamSlug)) {
      options.push({ id: "ucl_titles_badge", image: titlesArt, labelKey: "patchUclTitlesBadge" });
    }
    if (uclRespectOffered(product.season)) options.push({ id: "ucl_respect", image: UCL_RESPECT_ART, labelKey: "patchUclRespect" });
    options.push({ id: "europa_league", image: EUROPA_LEAGUE_ART, labelKey: "patchEuropaLeague" });
    if (product.league === "serie-a") {
      options.push({ id: "coppa_italia", image: COPPA_ITALIA_ART, labelKey: "patchCoppaItalia" });
    }
    // chest extras (owner request 2026-11-12): only the seasons src/lib/patch-eligibility.ts lists
    if (isClubWorldChampionSeason(teamSlug, product.season)) {
      options.push({ id: "club_world_cup", image: CLUB_WORLD_CHAMPIONS_ART, labelKey: "patchClubWorldChampions" });
    }
    const finalPrint = uclFinalPrint(teamSlug, product.season);
    if (finalPrint) options.push({ id: "ucl_final_print", image: finalPrint.image, labelKey: "patchFinalPrint" });
    return options;
  }
  if (product.kind === "national") {
    return [
      { id: "world_cup", image: WORLD_CUP_ART, labelKey: "patchWorldCup" },
      { id: "world_cup_champions", image: WORLD_CUP_CHAMPIONS_ART, labelKey: "patchWorldCupChampions" },
      { id: "world_cup_peace", image: WORLD_CUP_PEACE_ART, labelKey: "patchWorldCupPeace" },
    ];
  }
  return [];
}

/**
 * The patch NAME the supplier sheet writes for each id (owner request 2026-11-12: "just write the patch
 * name"). `league` gets the league's own name, e.g. "Premier League patch".
 */
export function patchSupplierName(id: PatchId, leagueId: string | null): string {
  switch (id) {
    case "league": {
      const league = leagueId ? leagueId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "League";
      return `${league} patch`;
    }
    case "champions_league":
      return "Champions League";
    case "champions_league_full":
      return "Champions League FULL SET + sponsor";
    case "europa_league":
      return "Europa League";
    case "club_world_cup":
      return "FIFA Club World Champions badge (gold, chest)";
    case "ucl_final_print":
      return "Champions League FINAL match print (chest)";
    case "ucl_titles_badge":
      return "Champions League TITLES badge (number of wins)";
    case "ucl_respect":
      return "RESPECT patch (under titles badge)";
    case "coppa_italia":
      return "Coppa Italia";
    case "world_cup":
      return "World Cup";
    case "world_cup_peace":
      return "World Cup Peace";
    case "world_cup_champions":
      return "World Cup Champions";
    default:
      return String(id);
  }
}
