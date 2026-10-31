/**
 * Writes the storefront's static catalog (src/data/catalog.json + collections.json): exactly the
 * hand-picked shirts in catalog/store-selection.json (nav from catalog/store-collections.json), each
 * showing its checked database photo, or the owner's real photo, or the placeholder.
 * Runs before every build when the database is reachable; otherwise the committed JSON is used as is.
 *   npm run store:export
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/data/types";

config({ path: ".env.local", quiet: true });


type Row = {
  id: string; handle: string; title_en: string; title_ar: string | null; season: string | null; kit: string;
  primary_image_url: string | null; photo_status: string | null; supplier_cover: string | null;
  team: { id: string; name_en: string; name_ar: string | null; type: "club" | "national"; league_id: string | null };
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("store:export skipped (no database settings) - using the committed catalog"); return; }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // the website shows exactly the hand-picked selection (catalog/store-selection.json), in its order
  const selection = (JSON.parse(readFileSync("catalog/store-selection.json", "utf8")) as { products: (Product & { productHandle?: string })[] }).products;
  const handles = selection.map((s) => s.productHandle ?? s.handle);
  const rows: Row[] = [];
  for (let i = 0; i < handles.length; i += 200) {
    const { data, error } = await db.from("products")
      .select("id,handle,title_en,title_ar,season,kit,primary_image_url,photo_status,supplier_cover,team:teams(id,name_en,name_ar,type,league_id)")
      .in("handle", handles.slice(i, i + 200));
    if (error) throw error;
    rows.push(...(data as unknown as Row[]));
  }
  const byHandle = new Map(rows.map((r) => [r.handle, r]));
  const checked = (r?: Row) => (r && (r.photo_status === "good" || r.photo_status === "owner_upload") && r.primary_image_url) || null;
  // an owner upload from admin/photos is a deliberate, just-made choice - it always wins, even over a
  // committed "real" shot below (owner report 2026-11-02: "the pictures in change a photo in admin
  // doesnt match the pictures in the website" - a real file on disk was silently out-ranking a fresh
  // admin upload, so replacing a photo there never actually changed what the site showed).
  const ownerUpload = (r?: Row) => (r && r.photo_status === "owner_upload" && r.primary_image_url) || null;
  // real photos committed in public/products/ (owner/partner shots, e.g. Real Madrid front/back) beat supplier photos
  const real = (p: Product) => !p.image.includes("_placeholder") && existsSync(`public${p.image}`);

  const products: Product[] = selection.map(({ productHandle, ...s }) => {
    const r = byHandle.get(productHandle ?? s.handle);
    const upload = ownerUpload(r);
    return {
      ...s,
      handle: r?.handle ?? s.handle, // the database handle, so checkout finds the product
      image: upload ?? (real(s) ? s.image : checked(r) ?? "/products/_placeholder.jpg"),
      ...(real(s) && s.images?.length ? { images: s.images } : {}),
      sourceHash: r?.supplier_cover ?? s.sourceHash,
      visible: true,
    };
  });
  const { leagues, teams } = JSON.parse(readFileSync("catalog/store-collections.json", "utf8"));

  // the price list the bot uses (published, else the latest draft) - the site shows the same numbers
  const { data: pl, error: pe } = await db.from("price_list_versions").select("data,status,version").in("status", ["published", "draft"])
    .order("status", { ascending: false }).order("version", { ascending: false }).limit(1).single(); // 'published' sorts after 'draft'
  if (pe) throw pe;
  writeFileSync("src/data/price-list.json", JSON.stringify(pl.data, null, 2) + "\n");

  writeFileSync("src/data/catalog.json", JSON.stringify({ products }, null, 2) + "\n");
  writeFileSync("src/data/collections.json", JSON.stringify({ leagues, teams }, null, 2) + "\n");
  const photos = products.filter((p) => !p.image.includes("_placeholder")).length;
  console.log(`store:export ${products.length} shirts (${photos} with photos, ${products.length - photos} placeholder), ${leagues.length} leagues, ${teams.length} teams`);
}

main().catch((e) => { console.error("store:export failed:", e.message); process.exit(1); });
