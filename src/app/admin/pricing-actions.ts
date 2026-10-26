"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { env } from "@/lib/env";
import { currentPriceList, clearPriceListCache } from "@/lib/pricing/load";
import { PriceListData } from "@/lib/pricing/schema";

interface PriceChange { what: string; from: string; to: string }

/** Plain-words list of what changed between two price lists (for the audit log and the "saved" note). */
function diff(before: PriceListData, after: PriceListData): PriceChange[] {
  const out: PriceChange[] = [];
  const compare = <T extends { id: string }>(a: T[], b: T[], label: (x: T) => string, value: (x: T) => string) => {
    for (const x of a) {
      const y = b.find((i) => i.id === x.id);
      if (y && value(x) !== value(y)) out.push({ what: label(x), from: value(x), to: value(y) });
    }
  };
  compare(before.groups, after.groups, (g) => g.name_en, (g) => `₪${g.price}`);
  compare(before.addons, after.addons, (a) => a.name_en, (a) => (a.price_tiers?.length ? `+₪${a.price_tiers.join(" / ")}` : `+₪${a.price}`));
  compare(before.offers, after.offers, (o) => o.name_en, (o) => (o.active ? `on: ₪${o.unit_price.short}${o.unit_price.long !== undefined ? `/${o.unit_price.long}` : ""} each from ${o.min_qty}` : "off"));
  compare(before.delivery.zones, after.delivery.zones, (z) => `Delivery: ${z.name_ar}`, (z) => `${z.name_ar} · ₪${z.fee} · ${z.days}`);
  return out;
}

type RawList = {
  groups: { id: string; price: number }[];
  addons: { id: string; price: number; per: string; price_tiers?: number[] }[];
  offers: { id: string; active: boolean; min_qty: number; unit_price: { short: number; long?: number } }[];
  delivery: { zones: { id: string; fee: number; days: string; name_ar: string }[] };
};

/**
 * The owner edits every price in admin Pricing. Saved straight into the live price list: the bot
 * and the website checkout use it right away; the website's shown prices follow after the rebuild
 * the deploy hook starts (they are exported at build time).
 */
export async function savePrices(form: FormData) {
  const staff = await requireStaff();
  const list = await currentPriceList();
  const stored = must(await db().from("price_list_versions").select("data").eq("id", list.id).single(), "price list") as { data: RawList };
  const data = structuredClone(stored.data); // keep notes and fields the form doesn't show
  const bad: string[] = [];
  const amount = (field: string, current: number, label: string) => {
    const v = String(form.get(field) ?? "").trim().replace(",", ".");
    if (!v) return current;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 5000) { bad.push(label); return current; }
    return Math.round(n * 100) / 100;
  };
  const text = (field: string, current: string, max: number) => String(form.get(field) ?? "").trim().slice(0, max) || current;

  for (const g of data.groups) g.price = amount(`g:${g.id}`, g.price, g.id);
  for (const a of data.addons) {
    if (a.per !== "patch") { a.price = amount(`a:${a.id}`, a.price, a.id); continue; }
    // per-patch prices: 1st / 2nd / 3rd patch on the same shirt (an empty box = same as the one before)
    const tiers = [1, 2, 3].map((n) => String(form.get(`a:${a.id}:${n}`) ?? "").trim());
    if (!tiers.some(Boolean)) continue;
    const ladder: number[] = [];
    for (const [i, v] of tiers.entries()) ladder.push(v ? amount(`a:${a.id}:${i + 1}`, a.price_tiers?.[i] ?? a.price, a.id) : ladder[i - 1] ?? a.price);
    a.price = ladder[0];
    if (ladder.every((x) => x === ladder[0])) delete a.price_tiers; else a.price_tiers = ladder;
  }
  for (const o of data.offers) {
    o.active = form.get(`o:${o.id}:active`) === "on";
    o.unit_price.short = amount(`o:${o.id}:short`, o.unit_price.short, o.id);
    if (o.unit_price.long !== undefined) o.unit_price.long = amount(`o:${o.id}:long`, o.unit_price.long, o.id);
    o.min_qty = Math.max(2, Math.min(20, Math.round(amount(`o:${o.id}:min`, o.min_qty, o.id))));
  }
  for (const z of data.delivery.zones) {
    z.fee = amount(`z:${z.id}:fee`, z.fee, z.id);
    z.days = text(`z:${z.id}:days`, z.days, 20);
    z.name_ar = text(`z:${z.id}:name`, z.name_ar, 60);
  }
  if (bad.length) redirect(`/admin/pricing?error=${encodeURIComponent(`Not saved - check these prices: ${bad.join(", ")}`)}`);

  const next = PriceListData.safeParse(data);
  if (!next.success) redirect(`/admin/pricing?error=${encodeURIComponent("Not saved - the price list didn't pass its checks")}`);
  const changes = diff(list.data, next.data);
  if (!changes.length) redirect("/admin/pricing?saved=0");

  must(await db().from("price_list_versions").update({ data }).eq("id", list.id).select("id"), "save prices");
  await db().from("audit_log").insert({ actor: staff.id, action: "pricing.edit", entity: "price_list_versions", entity_id: list.id, before: list.data, after: { changes } });
  clearPriceListCache();
  const hook = env().VERCEL_DEPLOY_HOOK_URL; // website shows prices exported at build time: rebuild
  if (hook) await fetch(hook, { method: "POST" }).catch((e) => console.error("deploy hook failed", (e as Error).message));
  revalidatePath("/admin", "layout");
  redirect(`/admin/pricing?saved=${changes.length}`);
}

/** Owner approves the price list the bot and website quote from (clears the "draft" warning). */
export async function publishPriceList() {
  const staff = await requireStaff();
  const list = await currentPriceList();
  if (list.status === "published") return;
  must(await db().from("price_list_versions").update({ status: "published", published_at: new Date().toISOString(), published_by: staff.id }).eq("id", list.id).eq("status", "draft").select("id"), "publish price list");
  await db().from("audit_log").insert({ actor: staff.id, action: "pricing.publish", entity: "price_list_versions", entity_id: list.id });
  clearPriceListCache();
  revalidatePath("/admin", "layout");
}
