"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";

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
  revalidatePath("/admin/photos");
}

/** Let the bot try supplier photos again (e.g. after the supplier added new ones). */
export async function retryProductPhoto(form: FormData) {
  await requireStaff();
  const productId = z.string().uuid().parse(form.get("productId"));
  await db().from("products").update({ photo_status: "unchecked" }).eq("id", productId);
  revalidatePath("/admin/photos");
}
