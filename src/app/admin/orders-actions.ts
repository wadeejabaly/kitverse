"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { STATUS_MESSAGE } from "@/lib/orders/admin";
import { queueOutgoing, sendQueued } from "@/lib/conversation/deliver";
import { sendOrderWhatsAppAlerts } from "@/lib/notify-whatsapp";
import { rejectManualPayment, verifyManualPayment } from "@/lib/orders/manual-pay";
import { formatIls, parseIlsToAgorot } from "@/lib/manual-pay-core";

const StatusChange = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["confirmed", "paid", "in_supplier_batch", "produced", "at_warehouse", "with_courier", "delivered", "cancelled", "issue"]),
  notify: z.boolean(),
  note: z.string().max(500).optional(),
});

export async function changeOrderStatus(form: FormData) {
  const staff = await requireStaff();
  const c = StatusChange.parse({ orderId: form.get("orderId"), status: form.get("status"), notify: form.get("notify") === "on", note: (form.get("note") as string) || undefined });
  const o = must(await db().from("orders").select("id,status,conversation_id,confirmed_at").eq("id", c.orderId).single(), "order") as { id: string; status: string; conversation_id: string | null; confirmed_at: string | null };
  if (o.status === c.status && !c.note) return; // nothing changed
  const becomingConfirmed = c.status === "confirmed" && o.status !== "confirmed";
  // an order confirmed by hand counts from now (overview "orders today", customer page date)
  const confirmedAt = becomingConfirmed && !o.confirmed_at ? { confirmed_at: new Date().toISOString() } : {};
  // only from the status this page showed: a double submit (or a second admin) can't apply it twice
  const changed = must(await db().from("orders").update({ status: c.status, ...confirmedAt }).eq("id", o.id).eq("status", o.status).select("id"), "update status") as { id: string }[];
  if (!changed.length && o.status !== c.status) return;
  must(await db().from("order_events").insert({ order_id: o.id, from_status: o.status, to_status: c.status, actor: "owner", actor_user: staff.id, note: c.note ?? null }).select("id"), "event");
  // owner decision 2026-11-02 (Part 9): one WhatsApp message per shirt, as soon as the order is
  // approved - no-op until WhatsApp is actually configured (src/lib/notify-whatsapp.ts)
  if (becomingConfirmed && !o.confirmed_at) await sendOrderWhatsAppAlerts(o.id); // first confirmation only, not every re-confirm
  // a cancelled personal-Bit / PayPal.Me order: its still-pending payment is cancelled too (never left "pending" to be confirmed later)
  if (c.status === "cancelled") await db().from("payments").update({ status: "cancelled" }).eq("order_id", o.id).eq("status", "pending").in("provider", ["bit_personal", "paypal_me"]);
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
  const picked = z.array(z.string().uuid()).min(1).parse(form.getAll("orderId"));
  // only orders that are still waiting to go to the supplier
  const ready = must(await db().from("orders").select("id,status").in("id", picked).in("status", ["confirmed", "paid"]), "batchable orders") as { id: string; status: string }[];
  if (!ready.length) redirect("/admin/orders");
  const ids = ready.map((o) => o.id);
  const batch = must(await db().from("supplier_batches").insert({ status: "draft" }).select("id").single(), "batch") as { id: string };
  const items = must(await db().from("order_items").select("id,order_id").in("order_id", ids), "items") as { id: string; order_id: string }[];
  if (items.length) must(await db().from("supplier_batch_items").insert(items.map((i) => ({ batch_id: batch.id, order_item_id: i.id }))).select("id"), "batch items");
  must(await db().from("orders").update({ status: "in_supplier_batch" }).in("id", ids).select("id"), "orders to batch");
  await db().from("order_events").insert(ready.map((o) => ({ order_id: o.id, from_status: o.status, to_status: "in_supplier_batch", actor: "owner", actor_user: staff.id, note: `batch ${batch.id}` })));
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
    await sendOrderWhatsAppAlerts(orderId);
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

/**
 * Personal Bit / PayPal.Me (owner requests 2026-11-10): the owner's manual
 * check is the ONLY thing that marks these orders paid
 * (src/lib/orders/manual-pay.ts). Returns a state for the admin card so an
 * amount that doesn't match the order total is shown, not silently accepted.
 */
export type ManualPayActionState = { ok?: boolean; error?: string; mismatch?: { kind: "short" | "over"; difference: string } } | null;

export async function confirmManualPayment(_prev: ManualPayActionState, form: FormData): Promise<ManualPayActionState> {
  const staff = await requireStaff();
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const received = parseIlsToAgorot(String(form.get("received") ?? ""));
  if (received === null || received <= 0) return { error: "Type the amount that actually arrived, e.g. 300 or 299.90" };
  const r = await verifyManualPayment({ orderId, staffId: staff.id, receivedAgorot: received, acceptMismatch: form.get("acceptMismatch") === "on", note: (form.get("note") as string) || undefined });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  if (r.ok) return { ok: true };
  if (r.code === "amount_mismatch") return { mismatch: { kind: r.kind, difference: formatIls(r.differenceAgorot) } };
  const why: Record<string, string> = {
    not_found: "No Bit / PayPal.Me payment on this order.",
    not_pending: "This payment was already handled (refresh the page).",
    order_cancelled: "This order is cancelled. If the money did arrive, refund it from your Bit / PayPal app.",
    bad_amount: "Type the amount that actually arrived.",
    server_error: "Couldn't save - try again.",
  };
  return { error: why[r.code] ?? "Couldn't save - try again." };
}

export async function rejectManualPaymentAction(_prev: ManualPayActionState, form: FormData): Promise<ManualPayActionState> {
  const staff = await requireStaff();
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const mode = z.enum(["retry", "cancel"]).parse(form.get("mode"));
  const r = await rejectManualPayment({ orderId, staffId: staff.id, mode, note: (form.get("note") as string) || undefined });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return r.ok ? { ok: true } : { error: "This payment was already handled (refresh the page)." };
}
