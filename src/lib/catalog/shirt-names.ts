import { slugify } from "@/data/slug";

/**
 * The ONE naming format for a shirt (owner request 2026-11-12: "let me fill the name, home or away,
 * the year - I don't want each name in a different format"). Admin's "Add shirt" builds every name from
 * the team + season + kit with this, in all three languages, matching the shirts already on the site:
 *
 *   EN  Manchester United 2026/27 Home Shirt      Barcelona 2005/06 Retro Home Shirt
 *   AR  قميص مانشستر يونايتد 2026/27 الأساسي        قميص برشلونة 2005/06 الأساسي ريترو
 *   HE  חולצת בית מנצ'סטר יונייטד 2026/27          חולצת בית רטרו ברצלונה 2005/06
 *
 * The handle (URL) is the English name as a slug, e.g. barcelona-2005-06-retro-home-shirt.
 */

export const SHIRT_KITS = ["Home", "Away", "Third"] as const;
export type ShirtKit = (typeof SHIRT_KITS)[number];

const KIT_AR: Record<ShirtKit, string> = { Home: "الأساسي", Away: "الاحتياطي", Third: "الثالث" };
const KIT_HE: Record<ShirtKit, string> = { Home: "בית", Away: "חוץ", Third: "שלישית" };

export interface ShirtNameInput {
  team: { name: string; nameAr: string; nameHe: string };
  season: string;
  kit: ShirtKit;
  retro: boolean;
}

export function shirtNames({ team, season, kit, retro }: ShirtNameInput) {
  const en = `${team.name} ${season} ${retro ? "Retro " : ""}${kit} Shirt`;
  const ar = `قميص ${team.nameAr} ${season} ${KIT_AR[kit]}${retro ? " ريترو" : ""}`;
  const he = `חולצת ${KIT_HE[kit]} ${retro ? "רטרו " : ""}${team.nameHe} ${season}`;
  return { en, ar, he, handle: slugify(en) };
}

/** Club seasons look like "2016/17", national-team ones like "2026" (a tournament year). */
export function isValidSeason(season: string, type: "club" | "national"): boolean {
  if (type === "national") return /^(19|20)\d{2}$/.test(season);
  const m = /^((?:19|20)\d{2})\/(\d{2})$/.exec(season);
  return !!m && (Number(m[1]) + 1) % 100 === Number(m[2]);
}

/** The season choices the form offers, newest first: club "2026/27" ... "1970/71", national "2026" ... "1970". */
export function seasonChoices(type: "club" | "national", newest = 2026, oldest = 1970): string[] {
  const out: string[] = [];
  for (let y = newest; y >= oldest; y--) out.push(type === "national" ? String(y) : `${y}/${String((y + 1) % 100).padStart(2, "0")}`);
  return out;
}

/**
 * A season the owner TYPED (owner request 2026-11-13: "let me type the team's name and year, not just
 * look through the list"), in whatever way he writes it, turned into the one format - or null:
 *   club:     "2010/11", "2010-11", "10/11", "2010/2011", "2010 11", or just "2010" -> "2010/11"
 *   national: "2026", or a club-style "2026/27" -> "2026"
 */
export function parseSeasonInput(raw: string, type: "club" | "national"): string | null {
  const t = raw.trim().replace(/\s+/g, "/").replace(/[\\.]/g, "/");
  if (!t) return null;
  let first: number | null = null, second: number | null = null;
  let m = /^((?:19|20)\d{2})$/.exec(t);
  if (m) first = Number(m[1]);
  m = m ? null : /^((?:19|20)?\d{2})[/_-]((?:19|20)?\d{2})$/.exec(t);
  if (m) {
    first = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
    if (m[1].length === 2 && first > 2040) first -= 100; // "98/99" -> 1998
    second = Number(m[2].slice(-2));
  }
  if (first === null) return null;
  const season = type === "national" ? String(first) : `${first}/${String((first + 1) % 100).padStart(2, "0")}`;
  if (type === "club" && second !== null && second !== (first + 1) % 100) return null; // "2010/14" is not a season
  return isValidSeason(season, type) ? season : null;
}
