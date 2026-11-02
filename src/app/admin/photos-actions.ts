"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { env } from "@/lib/env";
import type { Sleeve } from "@/data/types";

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

/**
 * The storefront gallery is two separate sets, not one list (ProductGallery.tsx swaps its whole
 * thumbnail row to imagesLongSleeve once the shopper picks "Long sleeve") - "front of the group" is
 * whichever photo in that sleeve has the lowest `sort`, same idea as primary_image_url but scoped to
 * one sleeve instead of the whole product. Promoting a photo never has to touch every other row's
 * sort - one row below the current lowest always sorts first.
 */
async function frontSort(productId: string, sleeve: Sleeve): Promise<number> {
  const lowest = (await db().from("product_images").select("sort").eq("product_id", productId).eq("sleeve", sleeve)
    .order("sort", { ascending: true }).limit(1)).data as { sort: number }[] | null;
  return (lowest?.[0]?.sort ?? 0) - 1;
}

/** Owner uploads a clean photo for a shirt (used instead of supplier photos from now on). */
export async function uploadProductPhoto(form: FormData) {
  const staff = await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));
  const sleeve = z.enum(["short", "long"]).default("short").parse(form.get("sleeve") ?? "short");
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
  const sort = await frontSort(p.id, sleeve);
  must(await db().from("product_images").insert({ product_id: p.id, url, sleeve, sort, status: "good", source: "owner", role: "front", checked_at: new Date().toISOString() }).select("id"), "image row");
  // primary_image_url/photo_status are the short-sleeve set's own "front" - a long-sleeve upload has
  // no counterpart there, it's only ever read from the long-sleeve set's gallery order above.
  if (sleeve === "short") must(await db().from("products").update({ primary_image_url: url, photo_status: "owner_upload" }).eq("id", p.id).select("id"), "set photo");
  await db().from("audit_log").insert({ actor: staff.id, action: "product.photo_upload", entity: "product", entity_id: p.id });
  // the website catalog is built at deploy time: rebuild so the photo goes live (~2 min)
  const hook = env().VERCEL_DEPLOY_HOOK_URL;
  if (hook) await fetch(hook, { method: "POST" }).catch((e) => console.error("deploy hook failed", (e as Error).message));
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
    await db().from("product_images").select("id,url,status,source,role,sleeve,sort,created_at").eq("product_id", id).order("sleeve").order("sort"),
    "product photos",
  ) as { id: string; url: string; status: string; source: string; role: string; sleeve: Sleeve; sort: number; created_at: string }[];
  return rows.map((r) => ({ ...r, isPrimary: r.sleeve === "short" && r.url === product.primary_image_url }));
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
  const image = must(await db().from("product_images").select("url,product_id,sleeve").eq("id", imageId).single(), "photo") as { url: string; product_id: string; sleeve: Sleeve };
  if (image.product_id !== productId) throw new Error("photo does not belong to this product");
  const sort = await frontSort(productId, image.sleeve);
  must(await db().from("product_images").update({ sort }).eq("id", imageId).select("id"), "reorder photo");
  // only the short-sleeve set has a counterpart outside product_images (primary_image_url) - the
  // long-sleeve set's "front" is purely gallery order, same as every other sleeve-scoped photo above.
  if (image.sleeve === "short") must(await db().from("products").update({ primary_image_url: image.url, photo_status: "owner_upload" }).eq("id", productId).select("id"), "set primary photo");
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
  // primary_image_url only ever reflects the short-sleeve set - a removed long-sleeve photo has
  // nothing of the product table's to fix, the gallery just shows one fewer long-sleeve photo.
  if (product.primary_image_url === image.url) {
    const remaining = (await db().from("product_images").select("url,source").eq("product_id", productId).eq("sleeve", "short").eq("status", "good")
      .order("sort", { ascending: true }).limit(20)).data as { url: string; source: string }[] | null;
    // prefer another owner-picked photo over a supplier/cleaned one, both front-of-group-first
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
 * Permanently remove a shirt added by mistake (duplicate, wrong supplier listing, wrong team...).
 * Refuses only one case: a shirt with any order history - order_items.product_id has no cascade on
 * purpose, so a past order never loses its line items just because the shirt it was for got deleted
 * later. A website shirt (status "featured") is allowed - scripts/export-store-catalog.ts skips any
 * catalog/store-selection.json entry whose row is gone (or hidden) when it builds the site, so this
 * also takes it off the website, on the next deploy (kickDeploy() below fires that rebuild, same as a
 * photo upload). The hand-picked JSON file itself still lists the handle after this - a future re-run
 * of apply-store-selection.ts would recreate it from there, so remove it from that file too if it
 * should stay gone for good.
 * Everything else about the shirt (its photos' storage files + product_images/product_options/
 * ig_media_products rows) is removed with it.
 */
export async function deleteProduct(form: FormData): Promise<{ ok: boolean; message: string }> {
  const staff = await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));

  const product = must(await db().from("products").select("id,title_en,status").eq("id", productId).single(), "product") as { id: string; title_en: string; status: string };

  const orders = await db().from("order_items").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if ((orders.count ?? 0) > 0) {
    return { ok: false, message: `Can't delete - ${orders.count} past order${orders.count === 1 ? "" : "s"} still reference this shirt.` };
  }

  const images = (await db().from("product_images").select("url").eq("product_id", productId)).data as { url: string }[] | null;
  const paths = (images ?? []).map((i) => mediaStoragePath(i.url)).filter((p): p is string => !!p);
  if (paths.length) await db().storage.from("media").remove(paths);

  // no rows exist today (checked 2026-11-02), but don't let a future one silently block the delete
  await db().from("availability_answers").delete().eq("product_id", productId);

  const del = await db().from("products").delete().eq("id", productId);
  if (del.error) return { ok: false, message: `Couldn't delete: ${del.error.message}` };

  await db().from("audit_log").insert({ actor: staff.id, action: "product.delete", entity: "product", entity_id: productId });
  if (product.status === "featured") await kickDeploy();
  revalidatePath("/admin/photos");
  return { ok: true, message: `Deleted "${product.title_en}".${product.status === "featured" ? " It'll come off the website in about 2 minutes." : ""}` };
}

/**
 * Same refusal as deleteProduct (order history only - a website shirt is allowed, see its comment),
 * checked in bulk instead of one row at a time: one query to find which of the picked ids are
 * actually deletable, then one storage removal, one availability_answers cleanup and one products
 * delete for all of them together - a 400-shirt selection should still be a handful of queries, not
 * 400x5.
 */
export async function bulkDeleteProducts(productIds: string[]): Promise<{ deleted: string[]; skipped: { id: string; title: string; reason: string }[] }> {
  const staff = await requireStaff();
  const ids = [...new Set(z.array(z.string().uuid()).min(1).max(500).parse(productIds))];

  const products = must(await db().from("products").select("id,title_en,status").in("id", ids), "products") as { id: string; title_en: string; status: string }[];
  const byId = new Map(products.map((p) => [p.id, p]));
  const skipped: { id: string; title: string; reason: string }[] = [];
  for (const id of ids) if (!byId.has(id)) skipped.push({ id, title: id, reason: "not found" });

  const candidateIds = products.map((p) => p.id);
  const orderRows = candidateIds.length
    ? (must(await db().from("order_items").select("product_id").in("product_id", candidateIds), "order items") as { product_id: string }[])
    : [];
  const orderedIds = new Set(orderRows.map((r) => r.product_id));
  for (const id of orderedIds) skipped.push({ id, title: byId.get(id)!.title_en, reason: "has order history" });

  const deletableIds = candidateIds.filter((id) => !orderedIds.has(id));
  if (!deletableIds.length) return { deleted: [], skipped };

  const images = (await db().from("product_images").select("url").in("product_id", deletableIds)).data as { url: string }[] | null;
  const paths = (images ?? []).map((i) => mediaStoragePath(i.url)).filter((p): p is string => !!p);
  if (paths.length) await db().storage.from("media").remove(paths);

  await db().from("availability_answers").delete().in("product_id", deletableIds);
  const del = await db().from("products").delete().in("id", deletableIds);
  if (del.error) throw new Error(`bulk delete: ${del.error.message}`);

  await db().from("audit_log").insert(deletableIds.map((id) => ({ actor: staff.id, action: "product.delete", entity: "product", entity_id: id })));
  // a deploy hook call is cheap - fire it whenever a featured shirt was in the batch, same as a single delete
  if (deletableIds.some((id) => byId.get(id)!.status === "featured")) await kickDeploy();
  revalidatePath("/admin/photos");
  return { deleted: deletableIds, skipped };
}

/**
 * Owner request 2026-11-02: "turn the products on and off... the ones i dont want to show for now".
 * "hidden" is already a real status the whole bot/checkout stack respects - search_catalog never
 * returns it (src/lib/catalog/search.ts), a draft order refuses to add it (src/lib/orders/draft.ts),
 * a web checkout line for it gets dropped (src/lib/orders/web.ts) - this is just the first thing that
 * lets the owner set it, instead of only ever reading it. A website ("featured") shirt is allowed too:
 * scripts/export-store-catalog.ts now skips any catalog/store-selection.json entry whose row is
 * hidden, so hiding one takes it off the website on the next deploy (kickDeploy() below), and showing
 * it again (status back to "available") brings it right back - the JSON file still lists its handle
 * either way, store-selection.json stays the record of WHICH shirts are hand-picked, this is only
 * whether a picked one is actually live right now.
 */
export async function bulkSetProductsHidden(productIds: string[], hidden: boolean): Promise<{ updated: string[]; skipped: { id: string; title: string; reason: string }[] }> {
  const staff = await requireStaff();
  const ids = [...new Set(z.array(z.string().uuid()).min(1).max(500).parse(productIds))];

  const products = must(await db().from("products").select("id,title_en,status").in("id", ids), "products") as { id: string; title_en: string; status: string }[];
  const byId = new Map(products.map((p) => [p.id, p]));
  const skipped: { id: string; title: string; reason: string }[] = [];
  for (const id of ids) if (!byId.has(id)) skipped.push({ id, title: id, reason: "not found" });

  const target = hidden ? "hidden" : "available";
  const changeableIds = products.filter((p) => p.status !== target).map((p) => p.id);
  if (changeableIds.length) {
    const upd = await db().from("products").update({ status: target }).in("id", changeableIds);
    if (upd.error) throw new Error(`bulk ${hidden ? "hide" : "unhide"}: ${upd.error.message}`);
    await db().from("audit_log").insert(changeableIds.map((id) => ({ actor: staff.id, action: hidden ? "product.hide" : "product.unhide", entity: "product", entity_id: id })));
    // unhiding could bring any of them back as a website shirt (export only checks "not hidden", not
    // "featured") - always rebuild for that; hiding only needs it when a website shirt was in the batch
    if (!hidden || changeableIds.some((id) => byId.get(id)!.status === "featured")) await kickDeploy();
  }
  revalidatePath("/admin/photos");
  return { updated: changeableIds, skipped };
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
