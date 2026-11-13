import "server-only";
import { db, must } from "@/lib/db";
import { notify } from "@/lib/notify";
import { batchOrderIds } from "@/lib/orders/admin";
import { registerNumber, trackNumber, trackingEnabled } from "./track17";
import { DELIVERED_AFTER_DAYS, receivedTime, shipmentStage, type TrackResult } from "./stage";

/**
 * Supplier-batch shipments (owner request 2026-11-13). The owner types the Junhe tracking number on a
 * batch; this moves the batch's orders forward on their own:
 *   parcel moving            -> orders `in_supplier_batch` become `produced`   (customer: "on the way")
 *   Junhe delivered to owner -> orders before `with_courier` become `with_courier` (customer: 24-72 hours)
 *   3 days after that        -> `with_courier` becomes `delivered`
 * Only ever FORWARD and only from the statuses listed: a cancelled / issue / already-further order is
 * never touched, and a status the owner set by hand is respected. Customers see only the status and the
 * estimated arrival on their order page - never the tracking number or carrier.
 */

const SHIPPED_FROM = ["in_supplier_batch"];
const RECEIVED_FROM = ["in_supplier_batch", "produced", "at_warehouse"];

type Batch = { id: string; tracking_number: string | null; tracking_registered: boolean; shipped_at: string | null; received_at: string | null };

/** Move the given orders that are in one of `from` to `to`, one compare-and-set per order, with an order_events row each. */
async function advance(orderIds: string[], from: string[], to: string, note: string): Promise<number> {
  if (!orderIds.length) return 0;
  const rows = must(await db().from("orders").select("id,status").in("id", orderIds).in("status", from), "orders to move") as { id: string; status: string }[];
  let moved = 0;
  for (const o of rows) {
    const done = must(await db().from("orders").update({ status: to }).eq("id", o.id).eq("status", o.status).select("id"), "move order") as { id: string }[];
    if (!done.length) continue;
    moved++;
    await db().from("order_events").insert({ order_id: o.id, from_status: o.status, to_status: to, actor: "system", note });
    // same as the owner's manual "Delivered" (orders-actions.ts changeOrderStatus): open the cash collection record
    if (to === "delivered") await db().from("cash_collections").upsert({ order_id: o.id, amount: 0, status: "with_courier" }, { onConflict: "order_id", ignoreDuplicates: true });
  }
  return moved;
}

/** The owner got the shipment (from tracking, or his own "I received it" button). Idempotent. */
export async function markBatchReceived(batchId: string, at: Date, how: string): Promise<number> {
  const b = must(await db().from("supplier_batches").select("id,received_at,shipped_at").eq("id", batchId).single(), "batch") as Batch;
  if (!b.received_at) {
    await db().from("supplier_batches").update({ received_at: at.toISOString(), ...(b.shipped_at ? {} : { shipped_at: at.toISOString() }) }).eq("id", batchId).is("received_at", null);
  }
  const moved = await advance(await batchOrderIds(batchId), RECEIVED_FROM, "with_courier", `shipment received (${how})`);
  if (moved) await notify({ kind: "shipment.received", priority: "normal", title: `Shipment arrived: ${moved} order${moved === 1 ? "" : "s"} out for delivery`, body: `They will be marked delivered after ${DELIVERED_AFTER_DAYS} days.`, link: `/admin/orders/batches/${batchId}` });
  return moved;
}

/** Read one batch's tracking now and apply it. Returns what happened, for the admin. */
export async function syncBatchTracking(batchId: string): Promise<string> {
  const b = must(await db().from("supplier_batches").select("id,tracking_number,tracking_registered,shipped_at,received_at").eq("id", batchId).single(), "batch") as Batch;
  if (!b.tracking_number) return "No tracking number yet.";
  if (!trackingEnabled()) return "Automatic tracking is off (no 17TRACK key yet).";
  const now = new Date();
  let result: TrackResult | null;
  try {
    if (!b.tracking_registered) {
      const refused = await registerNumber(b.tracking_number);
      if (refused) {
        await db().from("supplier_batches").update({ tracking_error: refused, tracking_checked_at: now.toISOString() }).eq("id", batchId);
        return refused;
      }
      await db().from("supplier_batches").update({ tracking_registered: true }).eq("id", batchId);
    }
    result = await trackNumber(b.tracking_number);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().from("supplier_batches").update({ tracking_error: msg.slice(0, 300), tracking_checked_at: now.toISOString() }).eq("id", batchId);
    return msg;
  }
  await db().from("supplier_batches").update({
    tracking_status: result?.status ?? "NotFound",
    tracking_events: result?.events ?? [],
    tracking_checked_at: now.toISOString(),
    tracking_error: null,
  }).eq("id", batchId);

  const stage = shipmentStage(result);
  if (stage === "none" || !result) return "No movement on the tracking yet.";
  if (!b.shipped_at) await db().from("supplier_batches").update({ shipped_at: now.toISOString() }).eq("id", batchId).is("shipped_at", null);
  if (stage === "shipped") {
    const moved = await advance(await batchOrderIds(batchId), SHIPPED_FROM, "produced", "shipped (tracking)");
    if (moved) await notify({ kind: "shipment.shipped", priority: "quiet", title: `Shipment on the way: ${moved} order${moved === 1 ? "" : "s"}`, link: `/admin/orders/batches/${batchId}` });
    return moved ? `On the way - ${moved} order(s) updated.` : "On the way.";
  }
  const moved = await markBatchReceived(batchId, receivedTime(result, now), "tracking");
  return moved ? `Delivered to you - ${moved} order(s) now out for delivery.` : "Delivered to you.";
}

/** Orders out for delivery for DELIVERED_AFTER_DAYS since their shipment arrived -> delivered. */
export async function deliverDueOrders(now = new Date()): Promise<number> {
  const due = new Date(now.getTime() - DELIVERED_AFTER_DAYS * 86_400_000).toISOString();
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const batches = (((await db().from("supplier_batches").select("id").lte("received_at", due).gte("received_at", since)).data) ?? []) as { id: string }[];
  let total = 0;
  for (const b of batches) total += await advance(await batchOrderIds(b.id), ["with_courier"], "delivered", `${DELIVERED_AFTER_DAYS} days after the shipment arrived`);
  return total;
}

/** Scheduled: every batch with a tracking number that hasn't arrived yet, then the 3-day delivered rule. */
export async function syncOpenShipments(): Promise<{ checked: number; delivered: number }> {
  let checked = 0;
  if (trackingEnabled()) {
    const open = (((await db().from("supplier_batches").select("id").not("tracking_number", "is", null).is("received_at", null).limit(50)).data) ?? []) as { id: string }[];
    for (const b of open) { await syncBatchTracking(b.id); checked++; }
  }
  return { checked, delivered: await deliverDueOrders() };
}
