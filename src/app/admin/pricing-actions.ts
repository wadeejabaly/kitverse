"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { currentPriceList, clearPriceListCache } from "@/lib/pricing/load";

/** Owner decision 2026-10-25: two delivery tiers. North (through Kfar Qara) is cheaper;
 *  everywhere else - center, Negev, Jerusalem, the West Bank and Eilat - is the same higher fee. */
export const DELIVERY_FEES = { north: 49.99, rest: 69.99 } as const;

export interface DeliveryFeesPreview {
  version: number;
  status: string;
  zones: { id: string; label: string; currentFee: number; newFee: number; changes: boolean }[];
}

export async function previewDeliveryFees(): Promise<DeliveryFeesPreview> {
  await requireStaff();
  const list = await currentPriceList();
  const zones = list.data.delivery.zones.map((z) => {
    const newFee = z.id === "north" ? DELIVERY_FEES.north : DELIVERY_FEES.rest;
    return { id: z.id, label: z.name_ar, currentFee: z.fee, newFee, changes: z.fee !== newFee };
  });
  return { version: list.version, status: list.status, zones };
}

/** Owner clicks "Apply" in /admin/pricing. Only touches delivery.zones[].fee - every other
 *  price, add-on and offer in the live list is left exactly as it is. Idempotent. */
export async function applyDeliveryFees() {
  const staff = await requireStaff();
  const list = await currentPriceList();
  const zones = list.data.delivery.zones.map((z) => ({
    ...z,
    fee: z.id === "north" ? DELIVERY_FEES.north : DELIVERY_FEES.rest,
  }));
  const data = { ...list.data, delivery: { ...list.data.delivery, zones } };
  must(await db().from("price_list_versions").update({ data }).eq("id", list.id).select("id"), "update delivery fees");
  await db().from("audit_log").insert({
    actor: staff.id, action: "pricing.apply_delivery_fees", entity: "price_list_versions", entity_id: list.id,
    before: { zones: list.data.delivery.zones }, after: { zones },
  });
  clearPriceListCache();
  revalidatePath("/admin/pricing");
}
