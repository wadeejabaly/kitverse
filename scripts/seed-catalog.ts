/**
 * Loads catalog/teams.json + catalog/products.json and the draft price list
 * into Supabase. Idempotent: re-running updates rows in place (upserts).
 *   npx tsx scripts/seed-catalog.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Team = { id: string; name_en: string; name_ar: string | null; aliases: string[]; type: "club" | "national"; league: string | null };
type Option = { audience: "adult" | "women" | "kids"; version: "fan" | "player"; sleeve: "short" | "long"; supplier_album_ids: string[] };
type Product = {
  handle: string; team_id: string; season: string | null; kit: string; era: "current" | "retro";
  title_en: string; title_ar: string; status: "featured" | "available"; flags: string[];
  primary_album: string; primary_cover: string; old_catalog_handle: string | null; options: Option[];
};

const LEAGUES: Record<string, [string, string]> = {
  "premier-league": ["Premier League", "الدوري الإنجليزي الممتاز"], "la-liga": ["La Liga", "الدوري الإسباني"],
  "serie-a": ["Serie A", "الدوري الإيطالي"], bundesliga: ["Bundesliga", "الدوري الألماني"], "ligue-1": ["Ligue 1", "الدوري الفرنسي"],
  "saudi-pro-league": ["Saudi Pro League", "الدوري السعودي"], mls: ["MLS", "الدوري الأمريكي"],
  "primeira-liga": ["Primeira Liga", "الدوري البرتغالي"], eredivisie: ["Eredivisie", "الدوري الهولندي"],
  "scottish-premiership": ["Scottish Premiership", "الدوري الاسكتلندي"], brasileirao: ["Brasileirão", "الدوري البرازيلي"],
  "argentina-primera": ["Argentine Primera", "الدوري الأرجنتيني"], "liga-mx": ["Liga MX", "الدوري المكسيكي"],
};

async function upsert(table: string, rows: object[], onConflict: string, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + chunk), { onConflict });
    if (error) throw new Error(`${table} @${i}: ${error.message}`);
  }
}

async function main() {
  // different supplier spellings can slug to the same team id: merge them
  const merged = new Map<string, Team & { supplier_albums: number }>();
  for (const t of JSON.parse(readFileSync("catalog/teams.json", "utf8")) as (Team & { supplier_albums: number })[]) {
    const prev = merged.get(t.id);
    if (!prev) { merged.set(t.id, t); continue; }
    const keep = prev.supplier_albums >= t.supplier_albums ? prev : t;
    merged.set(t.id, {
      ...keep,
      name_ar: prev.name_ar ?? t.name_ar,
      league: prev.league ?? t.league,
      aliases: [...new Set([...prev.aliases, ...t.aliases])],
      supplier_albums: prev.supplier_albums + t.supplier_albums,
    });
  }
  const teams = [...merged.values()];
  const products: Product[] = JSON.parse(readFileSync("catalog/products.json", "utf8"));

  const leagueIds = new Set(teams.map((t) => t.league).filter(Boolean) as string[]);
  await upsert("leagues", [...leagueIds].map((id) => ({ id, name_en: LEAGUES[id]?.[0] ?? id, name_ar: LEAGUES[id]?.[1] ?? null })), "id");

  await upsert("teams", teams.map((t) => ({
    id: t.id, name_en: t.name_en, name_ar: t.name_ar, aliases: t.aliases, type: t.type, league_id: t.league,
  })), "id");

  await upsert("products", products.map((p) => ({
    handle: p.handle, team_id: p.team_id, season: p.season, kit: p.kit, era: p.era, title_en: p.title_en, title_ar: p.title_ar,
    status: p.status, flags: p.flags, supplier_primary_album: p.primary_album, supplier_cover: p.primary_cover,
    old_catalog_handle: p.old_catalog_handle,
  })), "handle");

  // the old site's 262 cleaned white-background photos -> storage, used as the product photo
  const imgDir = "tools/catalog-build/data/old-images";
  let uploaded = 0;
  const done = new Set(((await db.from("products").select("handle").like("primary_image_url", "%/cleaned.jpg")).data ?? []).map((r) => r.handle));
  for (const p of products.filter((p) => p.old_catalog_handle && !done.has(p.handle))) {
    const file = `${imgDir}/${p.old_catalog_handle}.jpg`;
    if (!existsSync(file)) continue;
    const path = `products/${p.handle}/cleaned.jpg`;
    const { error } = await db.storage.from("media").upload(path, readFileSync(file), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    const url = db.storage.from("media").getPublicUrl(path).data.publicUrl;
    const { error: ue } = await db.from("products").update({ primary_image_url: url }).eq("handle", p.handle);
    if (ue) throw ue;
    uploaded++;
  }
  console.log(`uploaded ${uploaded} cleaned photos`);

  // map handle -> id (paged; PostgREST caps each response)
  const ids = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("products").select("id,handle").range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => ids.set(r.handle, r.id));
    if (data.length < 1000) break;
  }
  const options = products.flatMap((p) => p.options.map((o) => ({
    product_id: ids.get(p.handle), audience: o.audience, version: o.version, sleeve: o.sleeve, supplier_album_ids: o.supplier_album_ids,
  })));
  await upsert("product_options", options, "product_id,audience,version,sleeve");

  // draft price list v1 (owner approval pending -> stays 'draft')
  const price = JSON.parse(readFileSync("pricing/price-list.draft.json", "utf8"));
  const { error: pe } = await db.from("price_list_versions")
    .upsert({ version: 1, status: "draft", data: price, notes: "Draft v1 from IG DMs - awaiting owner approval" }, { onConflict: "version" });
  if (pe) throw pe;

  // towns -> delivery zones (draft, owner reviews in the admin)
  const loc = JSON.parse(readFileSync("pricing/localities.json", "utf8")) as { zones: Record<string, string[][]> };
  await upsert("localities", Object.entries(loc.zones).flatMap(([zone_id, towns]) =>
    towns.map(([en, ar, he]) => ({ name_en: en, name_ar: ar, name_he: he, zone_id }))), "name_en");

  // bot settings agreed in planning
  await upsert("bot_settings", [
    { key: "rate_limits", value: { new_per_24h: 40, new_lifetime_before_review: 80, engaged_per_24h: 80, buyer_per_24h: 150, spam_msgs_per_min: 20 } },
    { key: "spend", value: { daily_alert_usd: 10, daily_stop_usd: 25, override_until: null } },
    { key: "discounts", value: { bot_max_without_approval_ils: 0 } },
    { key: "deposit", value: { enabled: false, min_ils: 35, max_ils: 50, method: "bit", non_refundable: true } },
    { key: "hours", value: { always_on: true } },
    { key: "testers", value: { enabled: true, usernames: [], allowed_ids: [] } }, // test phase: bot only talks to listed usernames
    { key: "autonomy", value: { mode: "draft" } }, // launch phase: owner approves every reply; switch to "auto" in the admin
    { key: "approval_timeouts", value: { remind_after_min: 120 } },
    { key: "availability_cache", value: { not_available_days: 30 } },
  ], "key");

  console.log(`teams ${teams.length}, products ${products.length}, options ${options.length}, leagues ${leagueIds.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
