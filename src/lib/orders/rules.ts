/** Pure validation rules for order lines and customer details (unit-tested). */

export const ADULT_SIZES = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"] as const;
export const KIDS_SIZES = ["2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24", "26", "28"] as const;

/** "xxl" -> "XXL", "2xl" -> "XXL", "XXXL" -> "3XL", "medium" -> "M", "ميديوم" -> "M", "لارج" -> "L". */
export function normalizeSize(raw: string, audience: "adult" | "women" | "kids"): string | null {
  const s = raw.trim().toUpperCase().replace(/\s/g, "");
  const words: Record<string, string> = {
    small: "S", medium: "M", large: "L", "x-large": "XL", "سمول": "S", "سمال": "S", "ميديوم": "M", "مديوم": "M", "لارج": "L", "اكس لارج": "XL",
  };
  const w = words[raw.trim().toLowerCase()];
  if (w) return w;
  if (audience === "kids") {
    const n = s.replace(/[^0-9]/g, "");
    return (KIDS_SIZES as readonly string[]).includes(n) ? n : null;
  }
  const map: Record<string, string> = { "2XL": "XXL", XXXL: "3XL", XXXXL: "4XL", "XXXX L": "4XL" };
  const v = map[s] ?? s;
  return (ADULT_SIZES as readonly string[]).includes(v) ? v : null;
}

/** Israeli mobile/landline in any common format -> "05XXXXXXXX". */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+972")) d = "0" + d.slice(4);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  if (/^05\d{8}$/.test(d)) return d;
  if (/^0[2-9]\d{7}$/.test(d)) return d;
  return null;
}

/** "Fermin 7", print number must be 0-99 and name latin/arabic/hebrew letters, <= 14 chars. */
export function validatePrint(name?: string | null, number?: string | null): string | null {
  if (number && !/^\d{1,2}$/.test(number.trim())) return "number must be 0-99";
  if (name && name.trim().length > 14) return "name longer than 14 letters";
  if (name && !/^[\p{L} .'-]+$/u.test(name.trim())) return "name has unsupported characters";
  return null;
}

export const PATCHES = {
  champions_league: { label_ar: "شارة دوري الأبطال", clubs: true, nations: false },
  europa_league: { label_ar: "شارة الدوري الأوروبي", clubs: true, nations: false },
  club_world_cup: { label_ar: "شارة كأس العالم للأندية", clubs: true, nations: false },
  league: { label_ar: "شارة الدوري", clubs: true, nations: false },
  world_cup: { label_ar: "شارة كأس العالم", clubs: false, nations: true },
} as const;
export type PatchId = keyof typeof PATCHES;

/** null = fine; string = reason it needs the owner (unusual combination). */
export function checkPatches(patches: PatchId[], team: { type: "club" | "national"; league_id: string | null }): string | null {
  if (patches.length > 2) return "more than 2 patches (one per sleeve)";
  for (const p of patches) {
    const rule = PATCHES[p];
    if (!rule) return `unknown patch ${p}`;
    if (team.type === "club" && !rule.clubs) return `${p} patch is for national teams`;
    if (team.type === "national" && !rule.nations) return `${p} patch is for clubs`;
    if (p === "league" && !team.league_id) return "team's league is unknown - check which league patch";
  }
  if (new Set(patches).size !== patches.length) return "same patch twice";
  return null;
}
