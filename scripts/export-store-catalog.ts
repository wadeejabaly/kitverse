/**
 * Writes the storefront's static catalog (src/data/catalog.json + collections.json): exactly the
 * hand-picked shirts in catalog/store-selection.json (nav from catalog/store-collections.json), each
 * showing its checked database photo, or the owner's real photo, or the placeholder, and its
 * hand-authored name unless the owner renamed it in admin (products.title_override).
 * Runs before every build when the database is reachable; otherwise the committed JSON is used as is.
 *   npm run store:export
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/data/types";

config({ path: ".env.local", quiet: true });


type Row = {
  id: string; handle: string; title_en: string; title_ar: string | null; title_override: boolean; season: string | null; kit: string; status: string;
  primary_image_url: string | null; photo_status: string | null; supplier_cover: string | null;
  team: { id: string; name_en: string; name_ar: string | null; type: "club" | "national"; league_id: string | null };
};

type ImageRow = { product_id: string; url: string; sleeve: "short" | "long"; sort: number; status: string };

/**
 * Standardized copies of photos that live in Supabase Storage (owner spec 2026-11-09, "Complete
 * product image standardization"): catalog/image-overrides.json maps an original storage URL to the
 * committed 1200x1200 version under public/products/std/. The database row and the original upload
 * are left untouched (the original stays the backup, and admin still shows it); only the website
 * build swaps in the standardized file - and only when that file is really in this checkout, so a
 * build of older code can never point at a missing image. A photo uploaded later has a new URL, so it
 * simply shows as uploaded until it is standardized too (scripts/images/standardize.py).
 */
const overrides: Record<string, string> = existsSync("catalog/image-overrides.json")
  ? (JSON.parse(readFileSync("catalog/image-overrides.json", "utf8")) as { map: Record<string, string> }).map
  : {};
const std = (u: string): string => {
  const local = overrides[u];
  return local && existsSync(`public${local}`) ? local : u;
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
      .select("id,handle,title_en,title_ar,title_override,season,kit,status,primary_image_url,photo_status,supplier_cover,team:teams(id,name_en,name_ar,type,league_id)")
      .in("handle", handles.slice(i, i + 200));
    if (error) throw error;
    rows.push(...(data as unknown as Row[]));
  }
  const byHandle = new Map(rows.map((r) => [r.handle, r]));

  // Galleries (owner report 2026-11-02: "there are photos in the website that dont appear in the
  // admin") used to live ONLY as committed public/products/ files + the images/imagesLongSleeve
  // arrays below, hand-edited in this JSON - invisible to admin's photo manager, which only ever read
  // product_images. Photos migrated into product_images (scripts/migrate-real-photos.ts) now win here
  // instead, grouped by the sleeve set the storefront gallery actually swaps between (ProductGallery.tsx);
  // a product not yet migrated (shortRows empty) keeps the old JSON-sourced gallery untouched below.
  const imageRows: ImageRow[] = [];
  const productIds = rows.map((r) => r.id);
  for (let i = 0; i < productIds.length; i += 200) {
    const { data, error } = await db.from("product_images").select("product_id,url,sleeve,sort,status")
      .in("product_id", productIds.slice(i, i + 200)).neq("status", "bad").order("sleeve").order("sort");
    if (error) throw error;
    imageRows.push(...(data as unknown as ImageRow[]).map((row) => ({ ...row, url: std(row.url) })));
  }
  const imagesByProduct = new Map<string, ImageRow[]>();
  for (const row of imageRows) {
    const existing = imagesByProduct.get(row.product_id);
    if (existing) existing.push(row); else imagesByProduct.set(row.product_id, [row]);
  }

  const checked = (r?: Row) => (r && (r.photo_status === "good" || r.photo_status === "owner_upload") && r.primary_image_url && std(r.primary_image_url)) || null;
  // an owner upload from admin/photos is a deliberate, just-made choice - it always wins, even over a
  // committed "real" shot below (owner report 2026-11-02: "the pictures in change a photo in admin
  // doesnt match the pictures in the website" - a real file on disk was silently out-ranking a fresh
  // admin upload, so replacing a photo there never actually changed what the site showed).
  const ownerUpload = (r?: Row) => (r && r.photo_status === "owner_upload" && r.primary_image_url && std(r.primary_image_url)) || null;
  // real photos committed in public/products/ (owner/partner shots, e.g. Real Madrid front/back) beat supplier photos
  const real = (p: Product) => !p.image.includes("_placeholder") && existsSync(`public${p.image}`);

  // Owner decision 2026-11-02 (admin bulk delete/hide for products): a shirt the admin deleted or
  // hid no longer belongs on the website either, even though catalog/store-selection.json is a hand-
  // edited file that still lists its handle - that file stays the source of truth for WHICH shirts are
  // hand-picked, but a deleted/hidden row overrides it for whether one actually shows right now. This
  // is what lets admin's Delete/Hide buttons take a website shirt off the site on the next deploy
  // without needing a code change for every single one. (A re-run of apply-store-selection.ts would
  // still recreate a deleted handle from this file, same as it always has for any handle here with no
  // matching row - if a deleted shirt should stay gone for good, remove its entry from this file too.)
  const liveSelection = selection.filter(({ productHandle, handle }) => {
    const r = byHandle.get(productHandle ?? handle);
    return r && r.status !== "hidden";
  });

  const products: Product[] = liveSelection.map(({ productHandle, ...s }) => {
    const r = byHandle.get(productHandle ?? s.handle);
    const upload = ownerUpload(r);
    // owner report 2026-11-02: "like real madrid 25/26 you labeled some wrong i just want to be able
    // to fix them" - a rename in admin (products.title_override) wins over this entry's own
    // hand-authored name, same as an owner photo upload already wins above. Falls back to the
    // existing hand-authored Arabic/Hebrew name when the owner only corrected the English one.
    const renamed = r?.title_override;
    const rows = (r && imagesByProduct.get(r.id)) ?? [];
    const shortRows = rows.filter((row) => row.sleeve === "short");
    const longRows = rows.filter((row) => row.sleeve === "long");
    // shortRows[0] is the same photo `image` below already resolves to once migrated (migration sets
    // primary_image_url + photo_status "owner_upload" to match) - shortRows.length > 0 is simply
    // "this product's gallery has been migrated into the database", not a fact about this one photo.
    const migrated = shortRows.length > 0;
    return {
      ...s,
      handle: r?.handle ?? s.handle, // the database handle, so checkout finds the product
      ...(renamed ? { title: r.title_en, titleAr: r.title_ar ?? s.titleAr } : {}),
      image: upload ?? (real(s) ? s.image : checked(r) ?? "/products/_placeholder.jpg"),
      ...(migrated
        ? (shortRows.length > 1 ? { images: shortRows.slice(1).map((row) => row.url) } : { images: undefined })
        : (real(s) && s.images?.length ? { images: s.images } : {})),
      ...(migrated
        ? (longRows.length ? { imagesLongSleeve: longRows.map((row) => row.url) } : { imagesLongSleeve: undefined })
        : (real(s) && s.imagesLongSleeve?.length ? { imagesLongSleeve: s.imagesLongSleeve } : {})),
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

  // The site-wide welcome banner (owner request 2026-11-10: "30 shekels off your first order from
  // 300"): the newest ACTIVE first-order-only discount code, as plain ILS. No such code (or the
  // owner paused it in admin Discounts) = no banner on the next build. Amounts come from the code,
  // never from the copy.
  const { data: codes, error: ce } = await db.from("discount_codes")
    .select("code,kind,value,min_order,starts_at,ends_at,max_uses,used_count")
    .eq("active", true).eq("first_order_only", true).order("created_at", { ascending: false });
  if (ce) throw ce;
  const nowIso = new Date().toISOString();
  type CodeRow = { code: string; kind: "percent" | "fixed"; value: number; min_order: number; starts_at: string | null; ends_at: string | null; max_uses: number | null; used_count: number };
  const welcome = ((codes ?? []) as CodeRow[]).find((c) => (!c.starts_at || c.starts_at <= nowIso) && (!c.ends_at || c.ends_at > nowIso) && (c.max_uses == null || c.used_count < c.max_uses));
  writeFileSync("src/data/promo.json", JSON.stringify(welcome
    ? { welcome: { code: welcome.code, kind: welcome.kind, value: welcome.kind === "fixed" ? welcome.value / 100 : welcome.value, minOrder: welcome.min_order / 100 } }
    : {}, null, 2) + "\n");

  writeFileSync("src/data/catalog.json", JSON.stringify({ products }, null, 2) + "\n");
  writeFileSync("src/data/collections.json", JSON.stringify({ leagues, teams }, null, 2) + "\n");
  const photos = products.filter((p) => !p.image.includes("_placeholder")).length;
  console.log(`store:export ${products.length} shirts (${photos} with photos, ${products.length - photos} placeholder), ${leagues.length} leagues, ${teams.length} teams`);
}

main().catch((e) => { console.error("store:export failed:", e.message); process.exit(1); });
