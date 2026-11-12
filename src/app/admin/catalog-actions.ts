"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { env } from "@/lib/env";
import { isRetroSeason } from "@/data/pricing";
import { SHIRT_KITS, isValidSeason, parseSeasonInput, shirtNames } from "@/lib/catalog/shirt-names";
import { OUT_OF_STOCK_FLAG, SITE_LISTED_FLAG } from "@/lib/catalog/stock";
import collections from "../../../catalog/store-collections.json";

/**
 * Admin "Add shirt" (owner request 2026-11-12: "how can I add products by hand" + "make me a specific
 * way - team, home or away, the year - I don't want each name in a different format").
 *
 * The owner picks the team, season and kit; every name (EN/AR/HE) and the URL come from
 * src/lib/catalog/shirt-names.ts, never typed by hand. The shirt goes on the website through the
 * SITE_LISTED_FLAG (scripts/export-store-catalog.ts) and the deploy hook (~2 min), with the photos
 * uploaded here as its gallery (first short-sleeve photo = main photo, first long-sleeve = front of the
 * long-sleeve set). If the database already has that exact shirt (same team, season, kit - typically a
 * supplier listing), that row is put on the site instead of a duplicate, keeping its supplier albums.
 */

type CollectionTeam = { slug: string; name: string; nameAr: string; nameHe?: string; kind: string };
const TEAMS = (collections as { teams: CollectionTeam[] }).teams;

export type AddShirtResult = { ok: true; handle: string; title: string; reused: boolean } | { ok: false; error: string };

const MAX_PHOTO = 15 * 1024 * 1024;

async function kickDeploy() {
  const hook = env().VERCEL_DEPLOY_HOOK_URL;
  if (hook) await fetch(hook, { method: "POST" }).catch((e) => console.error("deploy hook failed", (e as Error).message));
}

async function storePhoto(handle: string, file: File): Promise<string> {
  const buf = await sharp(Buffer.from(await file.arrayBuffer())).rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const path = `products/${handle}/owner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const up = await db().storage.from("media").upload(path, buf, { contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message);
  return db().storage.from("media").getPublicUrl(path).data.publicUrl;
}

export async function addShirt(form: FormData): Promise<AddShirtResult> {
  const staff = await requireStaff();
  const parsed = z.object({
    team: z.string().min(1),
    season: z.string().min(4),
    kit: z.enum(SHIRT_KITS),
    player: z.boolean(),
    longSleeve: z.boolean(),
  }).safeParse({
    team: form.get("team"),
    season: form.get("season"),
    kit: form.get("kit"),
    player: form.get("player") === "on",
    longSleeve: form.get("longSleeve") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Pick the team, season and kit." };
  const { team: slug, kit, player, longSleeve } = parsed.data;

  const team = TEAMS.find((t) => t.slug === slug);
  if (!team) return { ok: false, error: "Unknown team." };
  const dbTeam = (await db().from("teams").select("id,type,league_id").eq("id", slug).maybeSingle()).data as { id: string; type: "club" | "national"; league_id: string | null } | null;
  if (!dbTeam) return { ok: false, error: `The team "${team.name}" isn't in the database yet - ask Claude to add it.` };
  // the form sends the season already in the one format; a typed one is normalised the same way here
  const season = parseSeasonInput(parsed.data.season, dbTeam.type) ?? parsed.data.season;
  if (!isValidSeason(season, dbTeam.type)) return { ok: false, error: dbTeam.type === "national" ? "A national-team season is a year, e.g. 2026." : "A club season looks like 2016/17." };

  const shortPhotos = form.getAll("shortPhotos").filter((f): f is File => f instanceof File && f.size > 0);
  const longPhotos = longSleeve ? form.getAll("longPhotos").filter((f): f is File => f instanceof File && f.size > 0) : [];
  if (!shortPhotos.length) return { ok: false, error: "Add at least one short-sleeve photo (the first one is the main photo)." };
  for (const f of [...shortPhotos, ...longPhotos]) if (f.size > MAX_PHOTO) return { ok: false, error: `"${f.name}" is larger than 15 MB.` };

  const retro = isRetroSeason(season);
  const names = shirtNames({ team: { name: team.name, nameAr: team.nameAr, nameHe: team.nameHe ?? team.name }, season, kit, retro });
  const era = retro ? "retro" : "current";

  // the same shirt already in the database (its own handle, or a supplier listing of the same team/season/kit)
  const byHandle = (await db().from("products").select("id,handle,flags,status").eq("handle", names.handle).maybeSingle()).data as { id: string; handle: string; flags: string[] | null; status: string } | null;
  const sameShirt = byHandle ?? ((await db().from("products").select("id,handle,flags,status").eq("team_id", slug).eq("season", season).eq("kit", kit)
    .neq("status", "hidden").order("created_at").limit(1)).data as { id: string; handle: string; flags: string[] | null; status: string }[] | null)?.[0] ?? null;

  let productId: string;
  let handle: string;
  if (sameShirt) {
    const flags = [...new Set([...(sameShirt.flags ?? []).filter((f) => !f.startsWith("kit not stated")), SITE_LISTED_FLAG])];
    must(await db().from("products").update({
      title_en: names.en, title_ar: names.ar, title_he: names.he, kit, era, status: "featured", flags, updated_at: new Date().toISOString(),
    }).eq("id", sameShirt.id).select("id"), "update shirt");
    productId = sameShirt.id;
    handle = sameShirt.handle;
  } else {
    const row = must(await db().from("products").insert({
      handle: names.handle, team_id: slug, season, kit, era,
      title_en: names.en, title_ar: names.ar, title_he: names.he,
      status: "featured", flags: [SITE_LISTED_FLAG, "owner_catalog", "not_at_supplier"],
    }).select("id,handle").single(), "new shirt") as { id: string; handle: string };
    productId = row.id;
    handle = row.handle;
  }

  // options: adult fan short always; player and long sleeve as ticked (retro shirts are fan only)
  const options: { audience: "adult"; version: "fan" | "player"; sleeve: "short" | "long" }[] = [{ audience: "adult", version: "fan", sleeve: "short" }];
  if (longSleeve) options.push({ audience: "adult", version: "fan", sleeve: "long" });
  if (player && !retro) {
    options.push({ audience: "adult", version: "player", sleeve: "short" });
    if (longSleeve) options.push({ audience: "adult", version: "player", sleeve: "long" });
  }
  for (const o of options) {
    const exists = (await db().from("product_options").select("id").eq("product_id", productId).eq("audience", o.audience).eq("version", o.version).eq("sleeve", o.sleeve).limit(1)).data;
    if (!exists?.length) must(await db().from("product_options").insert({ product_id: productId, ...o, supplier_album_ids: [] }).select("id"), "option");
  }

  // photos, in the order picked: sorts below anything already there, so they lead their set
  const lowest = async (sleeve: "short" | "long") =>
    (((await db().from("product_images").select("sort").eq("product_id", productId).eq("sleeve", sleeve).order("sort").limit(1)).data as { sort: number }[] | null)?.[0]?.sort ?? 0);
  let mainUrl: string | null = null;
  for (const [sleeve, files] of [["short", shortPhotos], ["long", longPhotos]] as const) {
    if (!files.length) continue;
    const start = (await lowest(sleeve)) - files.length;
    for (const [i, file] of files.entries()) {
      const url = await storePhoto(handle, file);
      must(await db().from("product_images").insert({
        product_id: productId, url, sleeve, sort: start + i, status: "good", source: "owner", role: i === 0 ? "front" : "other", checked_at: new Date().toISOString(),
      }).select("id"), "photo");
      if (sleeve === "short" && i === 0) mainUrl = url;
    }
  }
  if (mainUrl) must(await db().from("products").update({ primary_image_url: mainUrl, photo_status: "owner_upload" }).eq("id", productId).select("id"), "main photo");

  await db().from("audit_log").insert({ actor: staff.id, action: "product.add_shirt", entity: "product", entity_id: productId, after: { handle, title: names.en, reused: !!sameShirt, photos: shortPhotos.length + longPhotos.length } });
  await kickDeploy();
  revalidatePath("/admin/catalog");
  return { ok: true, handle, title: names.en, reused: !!sameShirt };
}

/** In stock / out of stock for any website shirt (owner request 2026-11-12) - see src/lib/catalog/stock.ts. */
export async function setShirtStock(productId: string, inStock: boolean): Promise<{ ok: boolean }> {
  const staff = await requireStaff();
  const id = z.string().uuid().parse(productId);
  const row = must(await db().from("products").select("flags").eq("id", id).single(), "product") as { flags: string[] | null };
  const flags = (row.flags ?? []).filter((f) => f !== OUT_OF_STOCK_FLAG);
  if (!inStock) flags.push(OUT_OF_STOCK_FLAG);
  must(await db().from("products").update({ flags, updated_at: new Date().toISOString() }).eq("id", id).select("id"), "stock");
  await db().from("audit_log").insert({ actor: staff.id, action: inStock ? "product.in_stock" : "product.out_of_stock", entity: "product", entity_id: id });
  await kickDeploy();
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/photos");
  return { ok: true };
}
