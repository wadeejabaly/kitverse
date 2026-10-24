/**
 * Writes the storefront's static catalog (src/data/catalog.json + collections.json) from the database:
 * the "featured" shirts whose photo passed the photo check (or was uploaded by the owner).
 * Shirts with real photos already in public/products/ (e.g. the Real Madrid front/back shots) keep them.
 * Runs before every build when the database is reachable; otherwise the committed JSON is used as is.
 *   npm run store:export
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { slugify } from "../src/data/slug";
import type { Product } from "../src/data/types";

config({ path: ".env.local", quiet: true });

const BIG_FIVE = ["premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"];
const KITS = new Set(["Home", "Away", "Third"]);

type Row = {
  id: string; handle: string; title_en: string; title_ar: string | null; season: string | null; kit: string;
  primary_image_url: string | null; photo_status: string | null; supplier_cover: string | null;
  team: { id: string; name_en: string; name_ar: string | null; type: "club" | "national"; league_id: string | null };
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("store:export skipped (no database settings) - using the committed catalog"); return; }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("products")
      .select("id,handle,title_en,title_ar,season,kit,primary_image_url,photo_status,supplier_cover,team:teams(id,name_en,name_ar,type,league_id)")
      .eq("status", "featured").in("photo_status", ["good", "owner_upload"]).not("primary_image_url", "is", null)
      .order("handle").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  const { data: leagueRows, error: le } = await db.from("leagues").select("id,name_en,name_ar");
  if (le) throw le;

  // shirts with real photos committed in public/products/ (owner/partner shots) keep them over supplier photos
  const previous = (JSON.parse(readFileSync("src/data/catalog.json", "utf8")).products as Product[])
    .filter((p) => p.visible && p.image.startsWith("/products/") && !p.image.includes("_placeholder") && existsSync(`public${p.image}`));
  const local = (handle: string) => previous.find((p) => p.handle === handle) ?? null;

  const products: Product[] = rows.filter((r) => r.season && KITS.has(r.kit) && r.team).map((r) => {
    const national = r.team.type === "national";
    const mine = local(r.handle);
    return {
      handle: r.handle,
      title: r.title_en,
      titleAr: r.title_ar ?? r.title_en,
      team: r.team.name_en,
      teamAr: r.team.name_ar ?? r.team.name_en,
      kind: national ? "national" : r.season!.startsWith("2026") ? "current" : "previous",
      season: r.season!,
      kit: r.kit as Product["kit"],
      league: national ? null : r.team.league_id,
      edition: "standard",
      image: mine?.image ?? r.primary_image_url!,
      ...(mine?.images?.length ? { images: mine.images } : {}),
      sourceHash: r.supplier_cover ?? r.id.slice(0, 8),
      visible: true,
    };
  });

  // curated shirts the database doesn't list as ready (e.g. no clean supplier photo) still show with their own photos
  for (const p of previous) if (!products.some((x) => x.handle === p.handle)) products.push(p);
  products.sort((a, b) => a.handle.localeCompare(b.handle));

  const usedLeagues = new Set(products.map((p) => p.league).filter(Boolean) as string[]);
  const leagues = (leagueRows ?? []).filter((l) => usedLeagues.has(l.id))
    .sort((a, b) => (BIG_FIVE.indexOf(a.id) + 1 || 99) - (BIG_FIVE.indexOf(b.id) + 1 || 99) || a.name_en.localeCompare(b.name_en))
    .map((l) => ({ slug: l.id, name: l.name_en, nameAr: l.name_ar ?? l.name_en }));
  const teamMap = new Map<string, { slug: string; name: string; nameAr: string; kind: "national" | "club" }>();
  for (const r of rows) if (r.team) teamMap.set(slugify(r.team.name_en), { slug: slugify(r.team.name_en), name: r.team.name_en, nameAr: r.team.name_ar ?? r.team.name_en, kind: r.team.type });
  for (const p of previous) if (!teamMap.has(slugify(p.team))) teamMap.set(slugify(p.team), { slug: slugify(p.team), name: p.team, nameAr: p.teamAr, kind: p.kind === "national" ? "national" : "club" });
  const teams = [...teamMap.values()].filter((t) => products.some((p) => slugify(p.team) === t.slug)).sort((a, b) => a.name.localeCompare(b.name));

  // the price list the bot uses (published, else the latest draft) - the site shows the same numbers
  const { data: pl, error: pe } = await db.from("price_list_versions").select("data,status,version").in("status", ["published", "draft"])
    .order("status", { ascending: false }).order("version", { ascending: false }).limit(1).single(); // 'published' sorts after 'draft'
  if (pe) throw pe;
  writeFileSync("src/data/price-list.json", JSON.stringify(pl.data, null, 2) + "\n");

  writeFileSync("src/data/catalog.json", JSON.stringify({ products }, null, 2) + "\n");
  writeFileSync("src/data/collections.json", JSON.stringify({ leagues, teams }, null, 2) + "\n");
  console.log(`store:export ${products.length} shirts (${products.filter((p) => p.image.startsWith("/products/")).length} with local photos), ${leagues.length} leagues, ${teams.length} teams`);
}

main().catch((e) => { console.error("store:export failed:", e.message); process.exit(1); });
