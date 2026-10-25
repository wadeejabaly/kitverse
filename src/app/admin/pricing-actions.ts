"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { env } from "@/lib/env";
import { currentPriceList, clearPriceListCache } from "@/lib/pricing/load";
import { PriceListData } from "@/lib/pricing/schema";
import approved from "../../../pricing/price-list.draft.json";

export interface PriceChange { what: string; from: string; to: string }

/** Human-readable differences between the live price list and the approved one in the repo. */
function diff(live: PriceListData, next: PriceListData): PriceChange[] {
  const out: PriceChange[] = [];
  const compare = <T extends { id: string }>(a: T[], b: T[], label: (x: T) => string, value: (x: T) => string) => {
    for (const id of [...new Set([...a, ...b].map((x) => x.id))]) {
      const x = a.find((i) => i.id === id), y = b.find((i) => i.id === id);
      const from = x ? value(x) : "-", to = y ? value(y) : "-";
      if (from !== to) out.push({ what: label((x ?? y)!), from, to }); // named as the owner knows it today
    }
  };
  compare(live.groups, next.groups, (g) => g.name_en, (g) => `₪${g.price}`);
  compare(live.addons, next.addons, (a) => a.name_en, (a) => `+₪${a.price}`);
  compare(live.offers, next.offers, (o) => o.name_en, (o) => (o.active ? `on: ₪${o.unit_price.short} each from ${o.min_qty}` : "off"));
  compare(live.delivery.zones, next.delivery.zones, (z) => `Delivery: ${z.name_ar}`, (z) => `₪${z.fee} · ${z.days} days`);
  for (const z of next.delivery.zones) {
    const was = live.delivery.zones.find((x) => x.id === z.id);
    if (was && was.name_ar !== z.name_ar) out.push({ what: `Delivery area name`, from: was.name_ar, to: z.name_ar });
  }
  // everything else, ignoring internal notes, source tags and key order (the database reorders keys)
  const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "_note" && k !== "source").sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, strip(x)])) : v;
  const rest = (d: PriceListData) => JSON.stringify(strip({ ...d, groups: 0, addons: 0, offers: 0, delivery: { ...d.delivery, zones: d.delivery.zones.map((z) => z.id) } }));
  if (rest(live) !== rest(next)) out.push({ what: "Other rules (payment, returns, sizes)", from: "current", to: "updated" });
  return out;
}

/** Price decisions are made in the repo (pricing/price-list.draft.json); the owner sees them here before they go live. */
export async function previewPriceChanges() {
  await requireStaff();
  const list = await currentPriceList();
  return { version: list.version, status: list.status, changes: diff(list.data, PriceListData.parse(approved)) };
}

/** Owner taps "Apply": the bot and the website checkout switch to the approved prices right away. */
export async function applyPriceChanges() {
  const staff = await requireStaff();
  const list = await currentPriceList();
  const next = PriceListData.parse(approved); // refuse a malformed file
  const changes = diff(list.data, next);
  if (!changes.length) return;
  must(await db().from("price_list_versions").update({ data: approved }).eq("id", list.id).select("id"), "apply price changes");
  await db().from("audit_log").insert({ actor: staff.id, action: "pricing.apply", entity: "price_list_versions", entity_id: list.id, before: list.data, after: { changes } });
  clearPriceListCache();
  // the website's static price hints are exported at build time: rebuild so they match
  const hook = env().VERCEL_DEPLOY_HOOK_URL;
  if (hook) await fetch(hook, { method: "POST" }).catch((e) => console.error("deploy hook failed", (e as Error).message));
  revalidatePath("/admin", "layout");
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
