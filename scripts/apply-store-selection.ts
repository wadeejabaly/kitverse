/**
 * Makes the database follow the hand-picked storefront catalog (catalog/store-selection.json):
 * - each shirt is matched to the supplier product (same handle, else same team + kit + 2026 season);
 * - shirts the supplier doesn't list are created as products flagged "not_at_supplier"
 *   (the bot checks availability with the owner before confirming them);
 * - exactly these shirts are "featured" (on the website); other featured shirts drop to "available"
 *   (still sellable through the bot on request).
 * Writes the match back as `productHandle` in the selection file.
 *   npx tsx --conditions=react-server scripts/apply-store-selection.ts [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { slugify } from "../src/data/slug";
config({ path: ".env.local", quiet: true });

type Sel = { handle: string; title: string; titleAr: string; team: string; teamAr: string; kind: string; season: string; kit: string; league: string | null; productHandle?: string };
const dry = process.argv.includes("--dry");

async function main() {
  const { db } = await import("../src/lib/db");
  const file = JSON.parse(readFileSync("catalog/store-selection.json", "utf8")) as { _note: string; products: Sel[] };
  const teams = (await db().from("teams").select("id,name_en,aliases,type")).data as { id: string; name_en: string; aliases: string[] | null; type: string }[];
  const leagues = new Set(((await db().from("leagues").select("id")).data ?? []).map((l) => l.id as string));
  const key = (s: string) => slugify(s).replace(/^(fc|ac|as|sc|ss|ssc|rc|cf|afc|olympique)-|-(fc|cf|sc)$/g, "");
  const teamFor = (name: string) => teams.find((t) => slugify(t.name_en) === slugify(name))
    ?? teams.find((t) => key(t.name_en) === key(name) || (t.aliases ?? []).some((a) => slugify(a) === slugify(name) || key(a) === key(name)));

  let created = 0, createdTeams = 0, matched = 0;
  const featured: string[] = [];
  for (const s of file.products) {
    let team = teamFor(s.team);
    if (!team) {
      team = { id: slugify(s.team), name_en: s.team, aliases: [], type: s.kind === "national" ? "national" : "club" };
      if (!dry) {
        const r = await db().from("teams").upsert({ id: team.id, name_en: s.team, name_ar: s.teamAr, type: team.type, league_id: s.league && leagues.has(s.league) ? s.league : null, aliases: [] }, { onConflict: "id" });
        if (r.error) throw new Error(`team ${s.team}: ${r.error.message}`);
      }
      teams.push(team); createdTeams++;
    }
    const same = (await db().from("products").select("id,handle").eq("handle", s.handle).maybeSingle()).data;
    const alike = same ? null : ((await db().from("products").select("id,handle,photo_status").eq("team_id", team.id).eq("kit", s.kit).eq("era", "current").like("season", "2026%").neq("status", "hidden")).data ?? [])
      .sort((a, b) => (b.photo_status === "good" ? 1 : 0) - (a.photo_status === "good" ? 1 : 0))[0];
    let handle = same?.handle ?? alike?.handle;
    if (handle) matched++;
    else {
      handle = s.handle;
      if (!dry) {
        const p = await db().from("products").upsert({
          handle, team_id: team.id, season: s.season, kit: s.kit, era: "current", title_en: s.title, title_ar: s.titleAr,
          status: "featured", flags: ["not_at_supplier", "owner_catalog"], is_kit_with_shorts: false, photo_status: "unchecked",
        }, { onConflict: "handle" }).select("id").single();
        if (p.error) throw new Error(`product ${handle}: ${p.error.message}`);
        const o = await db().from("product_options").upsert(["fan", "player"].map((version) => ({ product_id: p.data.id, audience: "adult", version, sleeve: "short", supplier_album_ids: [] })), { onConflict: "product_id,audience,version,sleeve" });
        if (o.error) throw new Error(`options ${handle}: ${o.error.message}`);
      }
      created++;
    }
    s.productHandle = handle;
    featured.push(handle);
  }

  if (!dry) {
    const cur = ((await db().from("products").select("handle").eq("status", "featured")).data ?? []).map((r) => r.handle as string);
    const demote = cur.filter((h) => !featured.includes(h));
    for (let i = 0; i < demote.length; i += 200) await db().from("products").update({ status: "available" }).in("handle", demote.slice(i, i + 200)).eq("status", "featured");
    for (let i = 0; i < featured.length; i += 200) await db().from("products").update({ status: "featured" }).in("handle", featured.slice(i, i + 200));
    writeFileSync("catalog/store-selection.json", JSON.stringify(file, null, 2) + "\n");
    console.log(`demoted ${demote.length} previously featured shirts to "available"`);
  }
  console.log(`${dry ? "[dry] " : ""}${file.products.length} shirts: ${matched} matched to supplier products, ${created} created (not at supplier), ${createdTeams} new teams`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
