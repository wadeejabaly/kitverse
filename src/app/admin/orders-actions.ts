"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { STATUS_MESSAGE } from "@/lib/orders/admin";
import { queueOutgoing, sendQueued } from "@/lib/conversation/deliver";

const StatusChange = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["confirmed", "paid", "in_supplier_batch", "produced", "at_warehouse", "with_courier", "delivered", "cancelled", "issue"]),
  notify: z.boolean(),
  note: z.string().max(500).optional(),
});

export async function changeOrderStatus(form: FormData) {
  const staff = await requireStaff();
  const c = StatusChange.parse({ orderId: form.get("orderId"), status: form.get("status"), notify: form.get("notify") === "on", note: (form.get("note") as string) || undefined });
  const o = must(await db().from("orders").select("id,status,conversation_id").eq("id", c.orderId).single(), "order") as { id: string; status: string; conversation_id: string | null };
  must(await db().from("orders").update({ status: c.status }).eq("id", o.id).select("id"), "update status");
  must(await db().from("order_events").insert({ order_id: o.id, from_status: o.status, to_status: c.status, actor: "owner", actor_user: staff.id, note: c.note ?? null }).select("id"), "event");
  if (c.status === "delivered") {
    await db().from("cash_collections").upsert({ order_id: o.id, amount: 0, status: "with_courier" }, { onConflict: "order_id", ignoreDuplicates: true });
  }
  if (c.notify && STATUS_MESSAGE[c.status] && o.conversation_id) {
    const conv = must(await db().from("conversations").select("*").eq("id", o.conversation_id).single(), "conv");
    const customer = must(await db().from("customers").select("*").eq("id", conv.customer_id).single(), "customer");
    await queueOutgoing(conv, [{ type: "text", text: STATUS_MESSAGE[c.status] }], { sender: "owner", draft: false });
    const late = conv.window_expires_at && new Date(conv.window_expires_at) < new Date();
    await sendQueued(conv, customer, { humanAgent: !!late });
  }
  revalidatePath(`/admin/orders/${o.id}`);
  revalidatePath("/admin/orders");
}

/** Put confirmed orders into a new supplier batch and open its spreadsheet. */
export async function createSupplierBatch(form: FormData) {
  const staff = await requireStaff();
  const ids = z.array(z.string().uuid()).min(1).parse(form.getAll("orderId"));
  const batch = must(await db().from("supplier_batches").insert({ status: "draft" }).select("id").single(), "batch") as { id: string };
  const items = must(await db().from("order_items").select("id,order_id").in("order_id", ids), "items") as { id: string; order_id: string }[];
  if (items.length) must(await db().from("supplier_batch_items").insert(items.map((i) => ({ batch_id: batch.id, order_item_id: i.id }))).select("id"), "batch items");
  must(await db().from("orders").update({ status: "in_supplier_batch" }).in("id", ids).select("id"), "orders to batch");
  await db().from("order_events").insert(ids.map((id) => ({ order_id: id, from_status: "confirmed", to_status: "in_supplier_batch", actor: "owner", actor_user: staff.id, note: `batch ${batch.id}` })));
  revalidatePath("/admin/orders");
  redirect(`/admin/orders/batches/${batch.id}`);
}

export async function markBatchSent(form: FormData) {
  await requireStaff();
  const id = z.string().uuid().parse(form.get("batchId"));
  must(await db().from("supplier_batches").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id).select("id"), "batch sent");
  revalidatePath(`/admin/orders/batches/${id}`);
}

/**
 * Owner decision 2026-10-25: a website order never auto-confirms (src/lib/orders/web.ts) - it
 * waits here. Approve moves it into the normal confirmed/supplier-batch/delivered flow; decline
 * cancels it. Both only ever act on a website order still awaiting confirmation, so this can
 * never confirm or cancel something the bot is mid-conversation on.
 */
export async function approveWebOrder(form: FormData) {
  const staff = await requireStaff();
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const row = must(await db().from("orders").update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", orderId).eq("status", "awaiting_confirmation").eq("source", "website").select("id").maybeSingle(), "approve order");
  if (row) {
    must(await db().from("order_events").insert({ order_id: orderId, from_status: "awaiting_confirmation", to_status: "confirmed", actor: "owner", actor_user: staff.id, note: "approved" }).select("id"), "approve event");
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function declineWebOrder(form: FormData) {
  const staff = await requireStaff();
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const note = (form.get("note") as string) || "declined by owner";
  const row = must(await db().from("orders").update({ status: "cancelled", notes: note })
    .eq("id", orderId).eq("status", "awaiting_confirmation").eq("source", "website").select("id").maybeSingle(), "decline order");
  if (row) {
    must(await db().from("order_events").insert({ order_id: orderId, from_status: "awaiting_confirmation", to_status: "cancelled", actor: "owner", actor_user: staff.id, note }).select("id"), "decline event");
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}
