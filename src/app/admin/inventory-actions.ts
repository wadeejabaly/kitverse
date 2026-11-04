"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";

/**
 * Inventory (owner request 2026-11-04): a simple on-hand stock count, not a full movement ledger - see
 * supabase/migrations/20261104090000_inventory.sql for why it's matched by (product_id, audience,
 * version, sleeve, size) only, never print_name/print_number.
 *
 * Every write here goes through `upsertQty`, which adds to whatever is already on that exact variant
 * row rather than overwriting it - so logging "+2 Large" twice correctly leaves 4 on hand, not 2.
 */

const Variant = z.object({
  productId: z.string().uuid(),
  audience: z.enum(["adult", "women", "kids"]),
  version: z.enum(["fan", "player"]),
  sleeve: z.enum(["short", "long"]),
  size: z.string().trim().min(1).max(20),
});

async function upsertQty(v: z.infer<typeof Variant>, deltaQty: number, note: string | null) {
  const match = { product_id: v.productId, audience: v.audience, version: v.version, sleeve: v.sleeve, size: v.size };
  const existing = (await db().from("inventory_items").select("id,qty").match(match).maybeSingle()).data as { id: string; qty: number } | null;
  if (existing) {
    const qty = Math.max(0, existing.qty + deltaQty);
    must(await db().from("inventory_items").update({ qty, ...(note ? { note } : {}) }).eq("id", existing.id).select("id"), "update inventory");
  } else if (deltaQty > 0) {
    must(await db().from("inventory_items").insert({ ...match, qty: deltaQty, note }).select("id"), "insert inventory");
  }
}

const AddInventory = Variant.extend({ qty: z.coerce.number().int().min(1).max(999), note: z.string().max(200).optional() });

/** Manual "I have these on hand" entry (owner logging shirts himself, 2026-11-04 request). */
export async function addInventory(form: FormData) {
  await requireStaff();
  const v = AddInventory.parse(Object.fromEntries(form));
  await upsertQty(v, v.qty, v.note?.trim() || null);
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
      await db().from("order_items").select("id,product_id,audience,version,sleeve,size,qty").eq("order_id", v.orderId).in("id", v.orderItemId),
      "order items",
    ) as { id: string; product_id: string | null; audience: string; version: string; sleeve: string; size: string; qty: number }[];
    for (const i of items) {
      if (!i.product_id) continue; // on-request items with no catalog product have nothing to log stock against
      await upsertQty(
        { productId: i.product_id, audience: i.audience as "adult" | "women" | "kids", version: i.version as "fan" | "player", sleeve: i.sleeve as "short" | "long", size: i.size },
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
