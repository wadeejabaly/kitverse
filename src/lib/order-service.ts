import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderReference } from "@/lib/checkout";
import { notifyOwnerOfPaidOrder, type NotificationItem } from "@/lib/notify";
import {
  decidePaidTransition,
  type OrderStatus,
  type PaidDecision,
} from "@/lib/orders";
import type { OrderItemRow, OrderRow } from "@/lib/supabase";

/**
 * The pending→paid settlement, shared by the two roads that reach it: the
 * browser's onApprove calling /api/checkout/capture-order, and PayPal's
 * webhook. They race routinely — and PayPal re-delivers webhooks it believes
 * failed — so both must end in exactly the same place, exactly once.
 *
 * The decision itself is a pure function in src/lib/orders.ts (unit-tested);
 * this module is only the database and email plumbing around it.
 */

export interface SettlementResult {
  decision: PaidDecision;
  /** True only for the single call that actually moved pending → paid. */
  promoted: boolean;
  order: OrderRow | null;
}

const ORDER_COLUMNS =
  "id, status, paypal_order_id, paypal_capture_id, customer_name, email, phone, address, city, country, notes, locale, subtotal_ils, shipping_ils, total_ils";

/** Look an order up by our uuid or by the PayPal order id, in that order. */
export async function findOrder(
  db: SupabaseClient,
  where: { orderId?: string | null; paypalOrderId?: string | null },
): Promise<OrderRow | null> {
  if (where.orderId) {
    const { data } = await db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", where.orderId)
      .maybeSingle();
    const row = data as OrderRow | null;
    if (row) return row;
  }
  if (where.paypalOrderId) {
    const { data } = await db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("paypal_order_id", where.paypalOrderId)
      .maybeSingle();
    return (data as OrderRow | null) ?? null;
  }
  return null;
}

/**
 * Mark an order paid, once.
 *
 * The `.eq("status", "pending")` in the UPDATE is the idempotency guard and
 * the reason this is safe under a race: whichever caller gets there first
 * matches a pending row and updates it; the second matches nothing, is told
 * it promoted nothing, and sends no second email. The guard lives in the
 * database's atomic update, not in a read-then-write in application code.
 */
export async function settleOrderPaid(
  db: SupabaseClient,
  order: OrderRow | null,
  captureId: string | null,
): Promise<SettlementResult> {
  const snapshot = order
    ? {
        status: order.status as OrderStatus,
        paypalCaptureId: order.paypal_capture_id,
      }
    : null;
  const decision = decidePaidTransition(snapshot, captureId);

  if (decision.action !== "promote" || !order) {
    return { decision, promoted: false, order };
  }

  const { data, error } = await db
    .from("orders")
    .update({ status: "paid", paypal_capture_id: decision.captureId })
    .eq("id", order.id)
    .eq("status", "pending")
    .select(ORDER_COLUMNS);

  if (error) {
    console.error(`[orders] failed to mark ${order.id} paid:`, error.message);
    return { decision, promoted: false, order };
  }

  const updated = (data as OrderRow[] | null) ?? [];
  if (updated.length !== 1) {
    // Someone else won the race. Correct outcome, no second notification.
    return { decision, promoted: false, order };
  }

  const paidOrder = updated[0];

  // Fire-and-forget, scheduled after the response so a slow email provider
  // cannot delay — or fail — the answer that the money moved.
  after(async () => {
    await sendOwnerNotification(db, paidOrder, decision.captureId);
  });

  return { decision, promoted: true, order: paidOrder };
}

/** Mark a still-pending order failed. Never touches an order already settled. */
export async function markOrderFailed(
  db: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await db
    .from("orders")
    .update({ status: "failed" })
    .eq("id", orderId)
    .eq("status", "pending");
  if (error) console.error(`[orders] failed to mark ${orderId} failed:`, error.message);
}

/**
 * Build and send the owner's order email. Wrapped end to end: a failure to
 * read the lines back, or to send, is logged and swallowed — the order is
 * paid either way.
 */
async function sendOwnerNotification(
  db: SupabaseClient,
  order: OrderRow,
  captureId: string,
): Promise<void> {
  try {
    const { data } = await db
      .from("order_items")
      .select(
        "handle, title_snapshot, size, version, name_number, badge, unit_price_ils, qty",
      )
      .eq("order_id", order.id);

    const rows = (data as OrderItemRow[] | null) ?? [];
    const items: NotificationItem[] = rows.map((row) => ({
      title: row.title_snapshot ?? row.handle ?? "unknown item",
      handle: row.handle ?? "",
      size: row.size ?? "",
      version: row.version ?? "",
      nameNumber: row.name_number,
      badge: row.badge === true,
      unitPrice: Number(row.unit_price_ils ?? 0),
      qty: Number(row.qty ?? 0),
    }));

    await notifyOwnerOfPaidOrder({
      reference: orderReference(order.id),
      orderId: order.id,
      locale: order.locale ?? "ar",
      customer: {
        name: order.customer_name ?? "",
        email: order.email ?? "",
        phone: order.phone ?? "",
        address: order.address ?? "",
        city: order.city ?? "",
        country: order.country ?? "IL",
        notes: order.notes,
      },
      items,
      subtotal: Number(order.subtotal_ils ?? 0),
      shipping: Number(order.shipping_ils ?? 0),
      total: Number(order.total_ils ?? 0),
      paypalOrderId: order.paypal_order_id ?? "",
      paypalCaptureId: captureId,
    });
  } catch (error) {
    console.error(
      `[orders] notification for ${order.id} failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}
