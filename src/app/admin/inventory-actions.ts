"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { PATCHES, type PatchId, checkPatches, validatePrint } from "@/lib/orders/rules";

/**
 * Inventory (owner request 2026-11-04, extended same day): on-hand stock the owner logs himself, not
 * a full movement ledger - see supabase/migrations/20261104090000_inventory.sql for why MATCHING
 * against order_items stays (product_id, audience, version, sleeve, size) only, never print details.
 *
 * Follow-up request, verbatim: "im intrested in logging is in detail with size namde and number and
 * badges" - so a row here is really a BATCH: variant + the exact print_name/print_number/patches on
 * those physical shirts (see 20261104100000_inventory_print_detail.sql). Every write goes through
 * `upsertQty`, which adds to whatever's already on that exact batch rather than overwriting it - so
 * logging "+2 blank Large" twice correctly leaves 4 on hand, and logging a blank Large then a "Messi
 * 10" Large correctly keeps them as two separate, countable things.
 */

const PATCH_IDS = Object.keys(PATCHES) as PatchId[];
const PatchArray = z.array(z.enum(PATCH_IDS as [PatchId, ...PatchId[]])).max(3);

const Variant = z.object({
  productId: z.string().uuid(),
  audience: z.enum(["adult", "women", "kids"]),
  version: z.enum(["fan", "player"]),
  sleeve: z.enum(["short", "long"]),
  size: z.string().trim().min(1).max(20),
});

const Detail = z.object({
  printName: z.string().trim().max(14).optional(),
  printNumber: z.string().trim().max(2).optional(),
  patches: PatchArray.optional(),
});

async function teamFor(productId: string) {
  const row = must(
    await db().from("products").select("season,team:teams(type,league_id)").eq("id", productId).single(),
    "product team",
  ) as unknown as { season: string | null; team: { type: "club" | "national"; league_id: string | null } };
  return row;
}

/** Throws with the owner-facing reason if the print/patches combo isn't valid for this product's team. */
async function validateDetail(productId: string, printName: string, printNumber: string, patches: PatchId[]) {
  const printErr = validatePrint(printName || null, printNumber || null);
  if (printErr) throw new Error(printErr);
  if (patches.length) {
    const { team, season } = await teamFor(productId);
    const patchErr = checkPatches(patches, team, season);
    if (patchErr) throw new Error(patchErr);
  }
}

async function upsertQty(
  v: z.infer<typeof Variant>,
  detail: { printName: string; printNumber: string; patches: PatchId[] },
  deltaQty: number,
  note: string | null,
) {
  const patches = [...detail.patches].sort();
  const match = {
    product_id: v.productId, audience: v.audience, version: v.version, sleeve: v.sleeve, size: v.size,
    print_name: detail.printName, print_number: detail.printNumber,
  };
  // supabase-js's .match()/.eq() just String()-ify the value with no array handling (unlike .contains()),
  // so an array there would come out as "patches=eq.world_cup,league" with no braces - not valid Postgres
  // array syntax. .filter() with a hand-built "{a,b}" literal is the one that actually matches exactly.
  const existing = (await db().from("inventory_items").select("id,qty").match(match).filter("patches", "eq", `{${patches.join(",")}}`).maybeSingle()).data as { id: string; qty: number } | null;
  if (existing) {
    const qty = Math.max(0, existing.qty + deltaQty);
    must(await db().from("inventory_items").update({ qty, ...(note ? { note } : {}) }).eq("id", existing.id).select("id"), "update inventory");
  } else if (deltaQty > 0) {
    must(await db().from("inventory_items").insert({ ...match, patches, qty: deltaQty, note }).select("id"), "insert inventory");
  }
}

const AddInventory = Variant.merge(Detail).extend({ qty: z.coerce.number().int().min(1).max(999), note: z.string().max(200).optional() });

/** Manual "I have these on hand" entry (owner logging shirts himself, 2026-11-04 request). */
export async function addInventory(form: FormData) {
  await requireStaff();
  const v = AddInventory.parse({ ...Object.fromEntries(form), patches: form.getAll("patches") });
  const printName = v.printName?.trim() ?? "";
  const printNumber = v.printNumber?.trim() ?? "";
  const patches = v.patches ?? [];
  await validateDetail(v.productId, printName, printNumber, patches);
  await upsertQty(v, { printName, printNumber, patches }, v.qty, v.note?.trim() || null);
  revalidatePath("/admin/inventory");
}

const SetQty = z.object({ id: z.string().uuid(), qty: z.coerce.number().int().min(0).max(999) });

/** Manual correction - set the count directly rather than add/subtract. */
export async function setInventoryQty(form: FormData) {
  await requireStaff();
  const v = SetQty.parse({ id: form.get("id"), qty: form.get("qty") });
  must(await db().from("inventory_items").update({ qty: v.qty }).eq("id", v.id).select("id"), "set inventory qty");
  revalidatePath("/admin/inventory");
}

export async function deleteInventoryItem(form: FormData) {
  await requireStaff();
  const id = z.string().uuid().parse(form.get("id"));
  must(await db().from("inventory_items").delete().eq("id", id).select("id"), "delete inventory item");
  revalidatePath("/admin/inventory");
}

/**
 * Owner request 2026-11-04, verbatim: "i want it to ask me first, because not every cancelled order
 * might be inventory" - so this only ever runs off an explicit checklist the owner submitted from the
 * order page (see cancel-inventory-prompt.tsx), never automatically on cancellation. `returned_to_
 * inventory_at` gets set either way (here and in skipInventoryReturn) so a cancelled order is only ever
 * asked about once.
 */
const ReturnToInventory = z.object({ orderId: z.string().uuid(), orderItemId: z.array(z.string().uuid()) });

export async function returnOrderToInventory(form: FormData) {
  const staff = await requireStaff();
  const v = ReturnToInventory.parse({ orderId: form.get("orderId"), orderItemId: form.getAll("orderItemId") });
  const order = must(await db().from("orders").select("id,status").eq("id", v.orderId).single(), "order") as { id: string; status: string };
  if (order.status !== "cancelled") throw new Error("Only a cancelled order can be returned to inventory");
  if (v.orderItemId.length) {
    const items = must(
      await db().from("order_items").select("id,product_id,audience,version,sleeve,size,qty,print_name,print_number,patches").eq("order_id", v.orderId).in("id", v.orderItemId),
      "order items",
    ) as { id: string; product_id: string | null; audience: string; version: string; sleeve: string; size: string; qty: number; print_name: string | null; print_number: string | null; patches: string[] }[];
    for (const i of items) {
      if (!i.product_id) continue; // on-request items with no catalog product have nothing to log stock against
      // Carry the exact print/patches over - what's actually on these physical shirts, not a blank
      // guess (owner follow-up 2026-11-04: "logging it in detail with ... name and number and badges").
      await upsertQty(
        { productId: i.product_id, audience: i.audience as "adult" | "women" | "kids", version: i.version as "fan" | "player", sleeve: i.sleeve as "short" | "long", size: i.size },
        { printName: i.print_name ?? "", printNumber: i.print_number ?? "", patches: (i.patches ?? []) as PatchId[] },
        i.qty,
        `from cancelled order #${v.orderId.slice(0, 8)}`,
      );
    }
  }
  must(
    await db()
      .from("orders")
      .update({ returned_to_inventory_at: new Date().toISOString() })
      .eq("id", v.orderId)
      .select("id"),
    "mark inventory resolved",
  );
  await db().from("order_events").insert({
    order_id: v.orderId,
    from_status: "cancelled",
    to_status: "cancelled",
    actor: "owner",
    actor_user: staff.id,
    note: v.orderItemId.length ? `added ${v.orderItemId.length} item(s) to inventory` : "no items added to inventory",
  });
  revalidatePath(`/admin/orders/${v.orderId}`);
  revalidatePath("/admin/inventory");
}

/** "No, these items aren't going into inventory" - still marks the order resolved so it stops asking. */
export async function skipInventoryReturn(form: FormData) {
  const staff = await requireStaff();
  const orderId = z.string().uuid().parse(form.get("orderId"));
  must(
    await db().from("orders").update({ returned_to_inventory_at: new Date().toISOString() }).eq("id", orderId).eq("status", "cancelled").select("id"),
    "mark inventory resolved",
  );
  await db().from("order_events").insert({ order_id: orderId, from_status: "cancelled", to_status: "cancelled", actor: "owner", actor_user: staff.id, note: "skipped - not adding to inventory" });
  revalidatePath(`/admin/orders/${orderId}`);
}
