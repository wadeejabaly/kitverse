"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { searchCatalog } from "@/lib/catalog/search";

export async function setLinkStatus(form: FormData) {
  const staff = await requireStaff();
  const id = z.string().uuid().parse(form.get("linkId"));
  const status = z.enum(["confirmed", "rejected"]).parse(form.get("status"));
  must(await db().from("ig_media_products").update({ status, confirmed_by: staff.id, confirmed_at: new Date().toISOString() }).eq("id", id).select("id"), "link status");
  revalidatePath("/admin/media");
}

/** Owner adds a product to a post by typing e.g. "Barcelona 2026/27 Away". */
export async function addLink(form: FormData) {
  const staff = await requireStaff();
  const mediaId = z.string().min(1).parse(form.get("mediaId"));
  const q = z.string().min(2).parse(String(form.get("q") ?? "").trim());
  const season = q.match(/\b(?:19|20)?\d{2}[/-]\d{2}\b|\b(?:19|20)\d{2}\b/)?.[0] ?? null;
  const kit = (["Home", "Away", "Third", "Fourth", "Goalkeeper", "Special"] as const).find((k) => new RegExp(`\\b${k}\\b`, "i").test(q)) ?? null;
  const team = q.replace(season ?? "", "").replace(kit ? new RegExp(kit, "i") : /$^/, "").trim();
  const hit = await searchCatalog({ team, season, kit, limit: 1 });
  const p = hit.products[0];
  if (!p) return;
  await db().from("ig_media_products").insert({ ig_media_id: mediaId, product_id: p.id, status: "confirmed", confidence: 1, confirmed_by: staff.id, confirmed_at: new Date().toISOString() });
  revalidatePath("/admin/media");
}
