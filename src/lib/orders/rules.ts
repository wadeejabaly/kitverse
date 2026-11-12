/** Pure validation rules for order lines and customer details (unit-tested). */
import { FULL_VERSION_PATCH, maxPatches } from "../patch-limits";

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
  // owner decision 2026-11-12: the badges as worn in the Champions League that season (may include the titles badge
  // and a sponsor patch). Alone on the shirt; priced as 3 patches on retro, 2 on current (src/lib/patch-limits.ts).
  champions_league_full: { label_ar: "شارات دوري الأبطال كاملة (نسخة المباريات)", clubs: true, nations: false },
  europa_league: { label_ar: "شارة الدوري الأوروبي", clubs: true, nations: false },
  club_world_cup: { label_ar: "شارة كأس العالم للأندية", clubs: true, nations: false },
  league: { label_ar: "شارة الدوري", clubs: true, nations: false },
  // Coppa Italia (added 2026-10-26, the patch-picker ask): a real competition
  // restriction, not just a storefront display limit - an Italian cup patch
  // on a Barcelona shirt would be wrong on Instagram too, so it is enforced
  // here (`leagues`), not only in the storefront's own eligibility list.
  coppa_italia: { label_ar: "شارة كأس إيطاليا", clubs: true, nations: false, leagues: ["serie-a"] },
  world_cup: { label_ar: "شارة كأس العالم", clubs: false, nations: true },
  // Added 2026-10-26 alongside coppa_italia: national-team shirts can now
  // carry up to 3 patches at once (the World Cup badge plus these two), see
  // the per-team-type cap below.
  world_cup_peace: { label_ar: "شارة السلام لكأس العالم", clubs: false, nations: true },
  world_cup_champions: { label_ar: "شارة أبطال كأس العالم", clubs: false, nations: true },
} as const;
export type PatchId = keyof typeof PATCHES;

/** null = fine; string = reason it needs the owner (unusual combination).
 *
 * Cap owner decision 2026-10-26: a club shirt still takes at most 2 patches
 * (one per sleeve); a national-team shirt can take up to 3 (the World Cup
 * badge plus the Peace and Champions badges, all three at once if the
 * customer wants them).
 */
export function checkPatches(patches: PatchId[], team: { type: "club" | "national"; league_id: string | null }, season?: string | null): string | null {
  // owner decision 2026-11-10: La Liga 2025/26 + 2026/27 shirts take only 1 (src/lib/patch-limits.ts)
  if (patches.includes(FULL_VERSION_PATCH) && patches.length > 1) return "the Champions League full version goes on the shirt alone - no other patch with it";
  const max = maxPatches({ type: team.type, leagueId: team.league_id, season });
  if (patches.length > max) return max === 1 ? "only 1 patch allowed on this shirt" : `more than ${max} patches allowed`;
  for (const p of patches) {
    const rule = PATCHES[p];
    if (!rule) return `unknown patch ${p}`;
    if (team.type === "club" && !rule.clubs) return `${p} patch is for national teams`;
    if (team.type === "national" && !rule.nations) return `${p} patch is for clubs`;
    if (p === "league" && !team.league_id) return "team's league is unknown - check which league patch";
    if ("leagues" in rule && rule.leagues && (!team.league_id || !(rule.leagues as readonly string[]).includes(team.league_id))) {
      return `${p} patch is not offered for this team's league`;
    }
  }
  if (new Set(patches).size !== patches.length) return "same patch twice";
  return null;
}
