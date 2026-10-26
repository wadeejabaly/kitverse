import { slugify } from "./slug";
import type { Kind } from "./types";
import type { PatchId } from "@/lib/orders/rules";

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
  europa_league: "propPatchEuropaLeague",
  club_world_cup: "propPatchChampionsLeague",
  coppa_italia: "propPatchCoppaItalia",
  world_cup: "propPatchWorldCup",
  world_cup_peace: "propPatchWorldCupPeace",
  world_cup_champions: "propPatchWorldCupChampions",
};

/** A club shirt takes at most 2 patches (one per sleeve); a national shirt up to 3. Mirrors checkPatches()'s cap. */
export const MAX_PATCHES_CLUB = 2;
export const MAX_PATCHES_NATIONAL = 3;

export function maxPatchesFor(product: { league: string | null; kind: Kind }): number {
  if (product.league !== null) return MAX_PATCHES_CLUB;
  if (product.kind === "national") return MAX_PATCHES_NATIONAL;
  return 0;
}

/**
 * The patches a product offers in the image picker, in display order. Empty
 * for a product that is neither a club shirt nor a national-team shirt.
 */
export function patchOptionsFor(product: {
  league: string | null;
  kind: Kind;
  team: string;
}): PatchOption[] {
  if (product.league !== null) {
    const options: PatchOption[] = [];
    const leagueArt = LEAGUE_ART[product.league];
    if (leagueArt) options.push({ id: "league", image: leagueArt, labelKey: "patchLeague" });
    const teamSlug = slugify(product.team);
    options.push({
      id: "champions_league",
      image: CHAMPIONS_LEAGUE_ART[teamSlug] ?? CHAMPIONS_LEAGUE_GENERAL,
      labelKey: "patchChampionsLeague",
    });
    options.push({ id: "europa_league", image: EUROPA_LEAGUE_ART, labelKey: "patchEuropaLeague" });
    if (product.league === "serie-a") {
      options.push({ id: "coppa_italia", image: COPPA_ITALIA_ART, labelKey: "patchCoppaItalia" });
    }
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
