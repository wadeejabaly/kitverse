"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import realPhotos from "@/data/real-photos-migration.json";

/**
 * One-time, idempotent: brings the ~700 "real" gallery photos that only ever lived as committed
 * public/products/ files + catalog/store-selection.json fields into product_images, so admin's "All
 * photos" can finally see them (owner report 2026-11-02: "there are photos in the website that dont
 * appear in the admin"). src/data/real-photos-migration.json is a snapshot of which 144 shirts that
 * applies to, taken when this was written - adding MORE committed photos later needs its own run of
 * scripts/migrate-real-photos.ts (the same logic, for local/CI use) regenerated against a fresh list.
 *
 * Reads each file over HTTPS from the live site rather than off local disk: a Vercel server action's
 * filesystem isn't guaranteed to have public/ assets available locally, but they're already being
 * served to every customer at that exact URL right now, so this is the one path guaranteed to work.
 * Safe to click more than once - a product already carrying a source:'real' row is skipped.
 */

const SITE_URL = "https://kitversejerseys.com";
const CONTENT_TYPE: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const extOf = (path: string) => (/\.[a-z0-9]+$/i.exec(path)?.[0] ?? ".jpg").toLowerCase();

export async function migrateRealPhotos() {
  const staff = await requireStaff();
  let migrated = 0, skipped = 0, uploaded = 0;
  const errors: string[] = [];

  for (const s of realPhotos as { handle: string; main: string; images: string[]; imagesLongSleeve: string[] }[]) {
    try {
      const product = (await db().from("products").select("id,primary_image_url,photo_status").eq("handle", s.handle).maybeSingle()).data as
        { id: string; primary_image_url: string | null; photo_status: string | null } | null;
      if (!product) { skipped++; continue; }
      const productId = product.id;

      const already = (await db().from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("source", "real")).count ?? 0;
      if (already > 0) { skipped++; continue; }

      const uploadOne = async (path: string, sleeve: "short" | "long", sort: number) => {
        const ext = extOf(path);
        const storagePath = `products/${s.handle}/real-${sleeve}-${sort}${ext}`;
        const res = await fetch(`${SITE_URL}${path}`);
        if (!res.ok) throw new Error(`fetch ${path}: ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        const up = await db().storage.from("media").upload(storagePath, bytes, { contentType: CONTENT_TYPE[ext] ?? "image/jpeg", upsert: true });
        if (up.error) throw new Error(up.error.message);
        const url = db().storage.from("media").getPublicUrl(storagePath).data.publicUrl;
        must(await db().from("product_images").insert({
          product_id: productId, url, sleeve, sort, role: sort === 0 ? "front" : "other", source: "real", status: "good", checked_at: new Date().toISOString(),
        }).select("id"), "image row");
        uploaded++;
        return url;
      };

      // a deliberate admin upload already outranks the committed file (src/app/admin/photos-actions.ts)
      // - leave that choice alone, just record it as this shirt's sort:0 short photo
      if (product.photo_status === "owner_upload" && product.primary_image_url) {
        must(await db().from("product_images").insert({
          product_id: productId, url: product.primary_image_url, sleeve: "short", sort: 0, role: "front", source: "owner", status: "good", checked_at: new Date().toISOString(),
        }).select("id"), "image row");
      } else {
        const mainUrl = await uploadOne(s.main, "short", 0);
        must(await db().from("products").update({ primary_image_url: mainUrl, photo_status: "owner_upload" }).eq("id", productId).select("id"), "set primary photo");
      }

      let sort = 1;
      for (const extra of s.images) await uploadOne(extra, "short", sort++);
      sort = 0;
      for (const path of s.imagesLongSleeve) await uploadOne(path, "long", sort++);

      migrated++;
    } catch (e) {
      errors.push(`${s.handle}: ${(e as Error).message}`);
    }
  }

  await db().from("audit_log").insert({ actor: staff.id, action: "product.migrate_real_photos", entity: "product", before: null, after: { migrated, uploaded, skipped, errors: errors.length } });
  revalidatePath("/admin/photos");
  return { migrated, uploaded, skipped, errors };
}
