/**
 * Which shirts can carry the two "chest" extras (owner request 2026-11-12, Real Madrid 2016/17 away
 * "plus all these possible patches"). Shared by the website picker (src/data/patches.ts), the website
 * order sanitizer (src/lib/product.ts) and the bot's rules (src/lib/orders/rules.ts).
 *
 * 1. `club_world_cup` = the gold "FIFA Club World Champions" badge. A club wears it while it holds the
 *    title - from the win until the next edition - so it is offered on that club's shirts of those
 *    seasons. Researched 2026-11-12 (FIFA Club World Cup winners 2007-2023, 2024/2025 Intercontinental
 *    Cup, 2025 Club World Cup), clubs the shop sells only:
 *      Milan Dec 2007 · Man United Dec 2008 · Barcelona Dec 2009, Dec 2011, Dec 2015 · Inter Dec 2010 ·
 *      Bayern Dec 2013, Feb 2021 (2020 ed.) · Real Madrid Dec 2014, Dec 2016, Dec 2017, Dec 2018,
 *      Feb 2023 (2022 ed.), Dec 2024 (Intercontinental) · Liverpool Dec 2019 · Chelsea Feb 2022
 *      (2021 ed.), Jul 2025 (Club World Cup) · Man City Dec 2023 · PSG Dec 2025 (Intercontinental).
 *    A December/February win covers the rest of that season and the next one (until the next edition).
 * 2. `ucl_final_print` = the Champions League final match-details print on the chest, only for the
 *    finals listed below (the owner adds more by asking).
 */

export const CLUB_WORLD_CHAMPION_SEASONS: Record<string, readonly string[]> = {
  "ac-milan": ["2007/08", "2008/09"],
  "manchester-united": ["2008/09", "2009/10"],
  barcelona: ["2009/10", "2010/11", "2011/12", "2012/13", "2015/16", "2016/17"],
  "inter-milan": ["2010/11", "2011/12"],
  "bayern-munich": ["2013/14", "2014/15", "2020/21", "2021/22"],
  "real-madrid": ["2014/15", "2015/16", "2016/17", "2017/18", "2018/19", "2019/20", "2022/23", "2023/24", "2024/25", "2025/26"],
  liverpool: ["2019/20", "2020/21"],
  chelsea: ["2021/22", "2022/23", "2025/26", "2026/27"],
  "manchester-city": ["2023/24", "2024/25"],
  "paris-saint-germain": ["2025/26", "2026/27"],
};

/** Champions League finals with a match-details print we can offer: team -> season -> its picture + words. */
export const UCL_FINAL_PRINTS: Record<string, Record<string, { image: string; words: string }>> = {
  "real-madrid": { "2016/17": { image: "/patches/ucl-final-cardiff-2017.jpg", words: "FINAL CARDIFF 2017 print" } },
};

export function isClubWorldChampionSeason(teamSlug: string | null | undefined, season: string | null | undefined): boolean {
  return !!teamSlug && !!season && (CLUB_WORLD_CHAMPION_SEASONS[teamSlug] ?? []).includes(season);
}

export function uclFinalPrint(teamSlug: string | null | undefined, season: string | null | undefined) {
  return (teamSlug && season && UCL_FINAL_PRINTS[teamSlug]?.[season]) || null;
}

/**
 * Clubs with a Champions League titles badge (the trophy with their number of wins, worn on the sleeve)
 * - the clubs we already have that numbered artwork for (public/patches/champions-league-<club>.jpg).
 */
export const UCL_TITLES_BADGE_CLUBS: readonly string[] = ["real-madrid", "ac-milan", "bayern-munich", "liverpool", "barcelona", "ajax"];

export function hasUclTitlesBadge(teamSlug: string | null | undefined): boolean {
  return !!teamSlug && UCL_TITLES_BADGE_CLUBS.includes(teamSlug);
}
