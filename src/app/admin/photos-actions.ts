"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { env } from "@/lib/env";

/** Deploy hook helper shared by every action below that changes what the website shows. */
async function kickDeploy() {
  const hook = env().VERCEL_DEPLOY_HOOK_URL;
  if (hook) await fetch(hook, { method: "POST" }).catch((e) => console.error("deploy hook failed", (e as Error).message));
}

/**
 * "media" storage paths are stored as full public URLs
 * (db().storage.from("media").getPublicUrl(path).data.publicUrl below) - this is the inverse, so a
 * row can be deleted from storage by the same path it was uploaded to. Returns null for a URL that
 * isn't actually in our "media" bucket (nothing to delete from storage, e.g. a committed real photo).
 */
function mediaStoragePath(url: string): string | null {
  const marker = "/storage/v1/object/public/media/";
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

/** Owner uploads a clean photo for a shirt (used instead of supplier photos from now on). */
export async function uploadProductPhoto(form: FormData) {
  const staff = await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size) return;
  if (file.size > 15 * 1024 * 1024) throw new Error("Photo is larger than 15 MB");
  const p = must(await db().from("products").select("id,handle").eq("id", productId).single(), "product") as { id: string; handle: string };
  // normalise: rotate per EXIF, max 2048px, JPEG
  const buf = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const path = `products/${p.handle}/owner-${Date.now()}.jpg`;
  const up = await db().storage.from("media").upload(path, buf, { contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message);
  const url = db().storage.from("media").getPublicUrl(path).data.publicUrl;
  must(await db().from("product_images").insert({ product_id: p.id, url, status: "good", source: "owner", role: "front", checked_at: new Date().toISOString() }).select("id"), "image row");
  must(await db().from("products").update({ primary_image_url: url, photo_status: "owner_upload" }).eq("id", p.id).select("id"), "set photo");
  await db().from("audit_log").insert({ actor: staff.id, action: "product.photo_upload", entity: "product", entity_id: p.id });
  // the website catalog is built at deploy time: rebuild so the photo goes live (~2 min)
  const hook = env().VERCEL_DEPLOY_HOOK_URL;
  if (hook) await fetch(hook, { method: "POST" }).catch((e) => console.error("deploy hook failed", (e as Error).message));
  revalidatePath("/admin/photos");
}

/** Let the bot try supplier photos again (e.g. after the supplier added new ones). */
export async function retryProductPhoto(form: FormData) {
  await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));
  await db().from("products").update({ photo_status: "unchecked" }).eq("id", productId);
  revalidatePath("/admin/photos");
}

/**
 * Every photo this product has on file - not just its current primary - so the owner can pick,
 * re-edit, or throw away any of them (owner report 2026-11-02: "i want the ability to remove more
 * than just the main picture i want to remove and edit all of them and choose the key picture" -
 * until now "Change a photo" only ever showed the ONE picture currently live and offered no way to
 * see, or do anything with, whatever else is sitting in product_images for that shirt).
 */
export async function listProductPhotos(productId: string) {
  await requireStaff();
  const id = z.string().uuid().parse(productId);
  const product = must(await db().from("products").select("primary_image_url").eq("id", id).single(), "product") as { primary_image_url: string | null };
  const rows = must(
    await db().from("product_images").select("id,url,status,source,role,created_at").eq("product_id", id).order("created_at", { ascending: false }),
    "product photos",
  ) as { id: string; url: string; status: string; source: string; role: string; created_at: string }[];
  return rows.map((r) => ({ ...r, isPrimary: r.url === product.primary_image_url }));
}

/**
 * Make an EXISTING photo (already in product_images, not a fresh upload) the shirt's main picture.
 * Always sets photo_status to "owner_upload" - not just "good" - because that's the flag
 * scripts/export-store-catalog.ts actually checks to let an admin choice win over a committed "real"
 * photo file on disk (see commit "Make an admin photo upload always win on the website, even over a
 * committed photo"): a deliberate pick from this list is exactly as deliberate as a fresh upload, and
 * needs the same authority or the website can keep ignoring it (owner report 2026-11-02: "the admin
 * picture isnt the same picture as the website" - this is the same class of bug for the picker, not
 * just the uploader).
 */
export async function setPrimaryPhoto(form: FormData) {
  const staff = await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));
  const imageId = z.string().uuid().parse(form.get("imageId"));
  const image = must(await db().from("product_images").select("url,product_id").eq("id", imageId).single(), "photo") as { url: string; product_id: string };
  if (image.product_id !== productId) throw new Error("photo does not belong to this product");
  must(await db().from("products").update({ primary_image_url: image.url, photo_status: "owner_upload" }).eq("id", productId).select("id"), "set primary photo");
  await db().from("audit_log").insert({ actor: staff.id, action: "product.photo_set_primary", entity: "product", entity_id: productId });
  await kickDeploy();
  revalidatePath("/admin/photos");
}

/**
 * Permanently remove one photo - from storage (when it's one of ours, not a supplier hotlink) and
 * from product_images. If it was the shirt's current primary, auto-promote the next-best remaining
 * photo (an owner upload first, else whichever is newest) so the shirt doesn't silently lose its
 * picture; with nothing left, falls back to the placeholder exactly like a shirt that never had a
 * photo (photo_status "none_clean" - the same state "Needs a photo" already looks for).
 */
export async function deleteProductPhoto(form: FormData) {
  const staff = await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));
  const imageId = z.string().uuid().parse(form.get("imageId"));

  const image = must(await db().from("product_images").select("url,product_id").eq("id", imageId).single(), "photo") as { url: string; product_id: string };
  if (image.product_id !== productId) throw new Error("photo does not belong to this product");

  const path = mediaStoragePath(image.url);
  if (path) await db().storage.from("media").remove([path]); // best-effort: a stray row with no file shouldn't block the delete below

  const del = await db().from("product_images").delete().eq("id", imageId);
  if (del.error) throw new Error(`delete photo: ${del.error.message}`);

  const product = must(await db().from("products").select("primary_image_url").eq("id", productId).single(), "product") as { primary_image_url: string | null };
  if (product.primary_image_url === image.url) {
    const remaining = (await db().from("product_images").select("url,source").eq("product_id", productId).eq("status", "good")
      .order("created_at", { ascending: false }).limit(20)).data as { url: string; source: string }[] | null;
    // prefer another owner-picked photo over a supplier/cleaned one, both newest-first
    const next = remaining?.find((r) => r.source === "owner") ?? remaining?.[0] ?? null;
    await db().from("products").update(
      next ? { primary_image_url: next.url, photo_status: next.source === "owner" ? "owner_upload" : "good" } : { primary_image_url: null, photo_status: "none_clean" },
    ).eq("id", productId);
  }

  await db().from("audit_log").insert({ actor: staff.id, action: "product.photo_delete", entity: "product", entity_id: productId });
  await kickDeploy();
  revalidatePath("/admin/photos");
}

/**
 * Owner corrects a shirt's name (owner report 2026-11-02: "like real madrid 25/26 you labeled some
 * wrong i just want to be able to fix them"). Sets title_override so the website export prefers this
 * over its own hand-authored catalog/store-selection.json entry for this shirt, the same way an
 * owner photo upload already wins over a committed photo - everything else keeps its current name
 * until the owner renames it.
 */
export async function renameProduct(form: FormData) {
  const staff = await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));
  const titleEn = z.string().trim().min(1).max(200).parse(form.get("titleEn"));
  const titleArRaw = form.get("titleAr");
  const titleAr = typeof titleArRaw === "string" && titleArRaw.trim() ? titleArRaw.trim().slice(0, 200) : null;
  must(await db().from("products").update({ title_en: titleEn, title_ar: titleAr, title_override: true }).eq("id", productId).select("id"), "rename");
  await db().from("audit_log").insert({ actor: staff.id, action: "product.rename", entity: "product", entity_id: productId });
  // the website name is baked into the exported catalog at deploy time, same as a photo (~2 min)
  const hook = env().VERCEL_DEPLOY_HOOK_URL;
  if (hook) await fetch(hook, { method: "POST" }).catch((e) => console.error("deploy hook failed", (e as Error).message));
  revalidatePath("/admin/photos");
}
