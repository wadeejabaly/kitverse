import "server-only";
import { db, must } from "../db";
import { normalize, looseTokens, similarity } from "../text";

export interface Team {
  id: string;
  name_en: string;
  name_ar: string | null;
  name_he: string | null;
  aliases: string[];
  type: "club" | "national";
  league_id: string | null;
}

let cache: { at: number; teams: Team[] } | null = null;

export async function allTeams(): Promise<Team[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.teams;
  const teams: Team[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await db().from("teams").select("id,name_en,name_ar,name_he,aliases,type,league_id").range(from, from + 999), "teams");
    teams.push(...(rows as Team[]));
    if (rows.length < 1000) break;
  }
  cache = { at: Date.now(), teams };
  return teams;
}

/** Best-matching teams for whatever the customer/model wrote ("برسا", "Barca", "man utd", "ريال"). */
export function rankTeams(query: string, teams: Team[], limit = 5): { team: Team; score: number }[] {
  const q = normalize(query);
  const qLoose = looseTokens(query).join(" ");
  if (!q) return [];
  return teams
    .map((team) => {
      const names = [team.name_en, team.name_ar, team.name_he, team.id.replace(/-/g, " "), ...team.aliases].filter(Boolean) as string[];
      let score = 0;
      for (const n of names) {
        const nn = normalize(n);
        if (nn === q || looseTokens(n).join(" ") === qLoose) { score = Math.max(score, 1); break; }
        score = Math.max(score, similarity(nn, q), similarity(looseTokens(n).join(" "), qLoose));
      }
      return { team, score };
    })
    .filter((r) => r.score >= 0.72)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function resolveTeam(query: string) {
  return rankTeams(query, await allTeams());
}
