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
