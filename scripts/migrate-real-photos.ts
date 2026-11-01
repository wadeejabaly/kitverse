/**
 * One-off: brings every "real" photo (owner/partner shots committed as files in public/products/ and
 * only ever listed by hand in catalog/store-selection.json's image/images/imagesLongSleeve fields)
 * into product_images, so admin's "All photos" manager can finally see, edit and remove them -
 * owner report 2026-11-02: "there are photos in the website that dont appear in the admin". Until
 * this runs, scripts/export-store-catalog.ts still falls back to reading those same fields straight
 * off the JSON for any product this hasn't reached yet, so nothing on the live site changes by running
 * this alone - it only takes effect once catalog.json is rebuilt from the database afterwards.
 *
 * Idempotent: a product already carrying a source:'real' row is left alone, so this is safe to re-run
 * (e.g. after adding more committed photos for products not covered yet) without duplicating anything
 * already migrated.
 *   npx tsx --conditions=react-server scripts/migrate-real-photos.ts [--dry]
 */
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const dry = process.argv.includes("--dry");

type Sel = { handle: string; productHandle?: string; image: string; images?: string[]; imagesLongSleeve?: string[] };

const CONTENT_TYPE: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function main() {
  const { db, must } = await import("../src/lib/db");
  const selection = (JSON.parse(readFileSync("catalog/store-selection.json", "utf8")) as { products: Sel[] }).products;
  const real = (image: string) => !image.includes("_placeholder") && existsSync(`public${image}`);

  let migrated = 0, skipped = 0, uploaded = 0, errors = 0;

  for (const s of selection) {
    const handle = s.productHandle ?? s.handle;
    if (!real(s.image)) continue; // this product's main photo isn't a committed file - nothing of this kind to migrate

    const product = (await db().from("products").select("id,primary_image_url,photo_status").eq("handle", handle).maybeSingle()).data as
      { id: string; primary_image_url: string | null; photo_status: string | null } | null;
    if (!product) { console.log(`skip ${handle}: no matching product row`); skipped++; continue; }

    const productId = product.id;
    const already = (await db().from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("source", "real")).count ?? 0;
    if (already > 0) { skipped++; continue; }

    const uploadOne = async (path: string, sleeve: "short" | "long", sort: number) => {
      const ext = extname(path) || ".jpg";
      const storagePath = `products/${handle}/real-${sleeve}-${sort}${ext}`;
      if (dry) { console.log(`  [dry] would upload ${path} -> ${storagePath}`); return `dry:${storagePath}`; }
      const bytes = readFileSync(`public${path}`);
      const up = await db().storage.from("media").upload(storagePath, bytes, { contentType: CONTENT_TYPE[ext] ?? "image/jpeg", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const url = db().storage.from("media").getPublicUrl(storagePath).data.publicUrl;
      must(await db().from("product_images").insert({
        product_id: productId, url, sleeve, sort, role: sort === 0 ? "front" : "other", source: "real", status: "good", checked_at: new Date().toISOString(),
      }).select("id"), "image row");
      uploaded++;
      return url;
    };

    try {
      // short set: the main photo first (unless an owner upload already deliberately overrides it -
      // that choice stays put), then every extra short-sleeve shot
      if (product.photo_status === "owner_upload" && product.primary_image_url) {
        // already deliberately chosen in admin - leave the primary alone, just record it as this
        // product's sort:0 short photo so the gallery (and "Set as main") have a complete picture
        if (!dry) must(await db().from("product_images").insert({
          product_id: product.id, url: product.primary_image_url, sleeve: "short", sort: 0, role: "front", source: "owner", status: "good", checked_at: new Date().toISOString(),
        }).select("id"), "image row");
      } else {
        const mainUrl = await uploadOne(s.image, "short", 0);
        if (!dry) must(await db().from("products").update({ primary_image_url: mainUrl, photo_status: "owner_upload" }).eq("id", product.id).select("id"), "set primary photo");
      }
      let sort = 1;
      for (const extra of s.images ?? []) await uploadOne(extra, "short", sort++);

      // long-sleeve set: no primary_image_url counterpart, purely gallery order
      sort = 0;
      for (const path of s.imagesLongSleeve ?? []) await uploadOne(path, "long", sort++);

      migrated++;
    } catch (e) {
      console.error(`FAILED ${handle}:`, (e as Error).message);
      errors++;
    }
  }

  console.log(`${dry ? "[dry run] " : ""}migrate-real-photos: ${migrated} products migrated, ${uploaded} photos uploaded, ${skipped} already done, ${errors} failed`);
}

main().catch((e) => { console.error("migrate-real-photos failed:", e.message); process.exit(1); });
