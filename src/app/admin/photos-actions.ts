"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { env } from "@/lib/env";

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
