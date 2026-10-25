import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderReference } from "@/lib/checkout";
import { notifyOwnerOfOrder, type NotificationItem } from "@/lib/notify";
import {
  CASH_PROVIDER,
  decidePaidTransition,
  isPaymentProvider,
  isSettleableProvider,
  type OrderStatus,
  type PaidDecision,
  type PaymentProvider,
  type SettleableProvider,
} from "@/lib/orders";
import type { OrderItemRow, OrderRow } from "@/lib/supabase";

/**
 * The pending→paid settlement, shared by the three roads that reach it: the
 * browser's PayPal onApprove calling /api/checkout/capture-order, PayPal's
 * webhook, and PayPlus's callback. The first two race routinely — and both
 * processors re-deliver a callback they believe failed — so all of them must
 * end in exactly the same place, exactly once.
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
  "id, status, payment_provider, paypal_order_id, paypal_capture_id, payplus_page_request_uid, payplus_transaction_uid, customer_name, email, phone, street, house_number, address, city, delivery_region, country, notes, locale, subtotal_ils, shipping_ils, gift_box_qty, gift_box_ils, total_ils";

/**
 * Where each settleable provider records the payment that closed an order. The
 * PayPal column is the capture; the PayPlus column is the transaction. Both
 * are unique in the schema, so one payment can never close two orders.
 *
 * `cash` is absent by construction — it is not a SettleableProvider, has no
 * reference column, and is paid to the courier, not through any processor
 * this application verifies.
 */
const SETTLED_REF_COLUMN: Record<SettleableProvider, keyof OrderRow> = {
  paypal: "paypal_capture_id",
  payplus: "payplus_transaction_uid",
};

/** The settled-reference column for a provider, or null for a manual rail. */
function settledRefColumn(provider: PaymentProvider): keyof OrderRow | null {
  return isSettleableProvider(provider) ? SETTLED_REF_COLUMN[provider] : null;
}

/**
 * The provider recorded on a row. Rows written before migration 0002 have no
 * column at all; anything unrecognised reads as PayPal, which is what those
 * rows are — and, being explicit, is what the provider check then enforces.
 */
export function providerOf(order: OrderRow): PaymentProvider {
  return isPaymentProvider(order.payment_provider) ? order.payment_provider : "paypal";
}

/**
 * Look an order up by our uuid first, then by whichever provider reference
 * was supplied. Our own uuid is the preferred route for both processors:
 * PayPal carries it in custom_id/invoice_id, PayPlus in more_info.
 */
export async function findOrder(
  db: SupabaseClient,
  where: {
    orderId?: string | null;
    paypalOrderId?: string | null;
    payplusPageRequestUid?: string | null;
  },
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
    const row = data as OrderRow | null;
    if (row) return row;
  }
  if (where.payplusPageRequestUid) {
    const { data } = await db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("payplus_page_request_uid", where.payplusPageRequestUid)
      .maybeSingle();
    return (data as OrderRow | null) ?? null;
  }
  return null;
}

/** What the confirmation page is allowed to learn from a reference in a URL. */
export interface OrderStateByReference {
  status: OrderStatus;
  provider: PaymentProvider;
}

/**
 * The confirmation page's question: what state is the order behind this
 * reference in? Returns the status and the rail, and NOTHING else — no name,
 * no email, no address, and not the order total, because the short reference
 * travels in a URL that gets shared and logged.
 *
 * `reference` is a generated column (migration 0002) holding the same eight
 * characters orderReference() prints. It is not unique: on the astronomically
 * unlikely collision this declines to answer rather than reporting some other
 * customer's order, and the page falls back to "we are confirming your
 * payment".
 */
export async function findOrderStateByReference(
  db: SupabaseClient,
  reference: string,
): Promise<OrderStateByReference | null> {
  if (!/^[A-Z0-9]{4,16}$/.test(reference)) return null;

  const { data, error } = await db
    .from("orders")
    .select("status, payment_provider")
    .eq("reference", reference)
    .limit(2);

  if (error) {
    console.error(`[orders] reference lookup failed:`, error.message);
    return null;
  }

  const rows =
    (data as { status: OrderStatus; payment_provider: string | null }[] | null) ?? [];
  if (rows.length !== 1) return null;

  const row = rows[0];
  const provider: PaymentProvider = isPaymentProvider(row.payment_provider)
    ? row.payment_provider
    : "paypal";

  return { status: row.status, provider };
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
  reference: string | null,
  provider: SettleableProvider,
): Promise<SettlementResult> {
  const snapshot = order
    ? {
        status: order.status as OrderStatus,
        provider: providerOf(order),
        settledRef: (() => {
          const column = settledRefColumn(providerOf(order));
          return column ? ((order[column] ?? null) as string | null) : null;
        })(),
      }
    : null;
  const decision = decidePaidTransition(snapshot, reference, provider);

  if (decision.action !== "promote" || !order) {
    return { decision, promoted: false, order };
  }

  const { data, error } = await db
    .from("orders")
    .update({
      status: "paid",
      [SETTLED_REF_COLUMN[provider]]: decision.reference,
    })
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
    await sendOwnerNotification(db, paidOrder, provider, decision.reference);
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
 * Announce a cash-on-delivery order to the owner the moment it is created.
 *
 * This is the one notification that does NOT wait for money, because cash
 * orders have none to wait for yet — the buyer pays the courier on delivery,
 * not this application. The card paths stay the other way round — they
 * notify on payment, because until then nothing has happened worth an email.
 *
 * Reads the row back rather than trusting what the route had in hand, so the
 * email describes what was actually written. Swallows every failure: an order
 * that exists is not un-made by a mail provider having a bad minute.
 */
export async function announceCashOrder(
  db: SupabaseClient,
  orderId: string,
): Promise<void> {
  try {
    const { data } = await db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", orderId)
      .maybeSingle();
    const order = data as OrderRow | null;
    if (!order) {
      console.error(`[orders] cash order notification: order ${orderId} vanished`);
      return;
    }
    await sendOwnerNotification(db, order, CASH_PROVIDER, "");
  } catch (error) {
    console.error(
      `[orders] cash order notification for ${orderId} failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Build and send the owner's order email. Wrapped end to end: a failure to
 * read the lines back, or to send, is logged and swallowed — the order is
 * paid (or, for cash, placed) either way.
 */
async function sendOwnerNotification(
  db: SupabaseClient,
  order: OrderRow,
  provider: PaymentProvider,
  paymentRef: string,
): Promise<void> {
  try {
    const { data } = await db
      .from("order_items")
      .select(
        "handle, title_snapshot, size, version, name_number, patch, unit_price_ils, qty",
      )
      .eq("order_id", order.id);

    const rows = (data as OrderItemRow[] | null) ?? [];
    const items: NotificationItem[] = rows.map((row) => ({
      title: row.title_snapshot ?? row.handle ?? "unknown item",
      handle: row.handle ?? "",
      size: row.size ?? "",
      version: row.version ?? "",
      nameNumber: row.name_number,
      patch:
        row.patch === "league" || row.patch === "ucl" || row.patch === "worldcup"
          ? row.patch
          : "none",
      unitPrice: Number(row.unit_price_ils ?? 0),
      qty: Number(row.qty ?? 0),
    }));

    await notifyOwnerOfOrder({
      reference: orderReference(order.id),
      orderId: order.id,
      locale: order.locale ?? "ar",
      customer: {
        name: order.customer_name ?? "",
        email: order.email ?? "",
        phone: order.phone ?? "",
        street: order.street ?? "",
        houseNumber: order.house_number ?? "",
        city: order.city ?? "",
        region: order.delivery_region ?? "",
        country: order.country ?? "IL",
        notes: order.notes,
      },
      items,
      subtotal: Number(order.subtotal_ils ?? 0),
      shipping: Number(order.shipping_ils ?? 0),
      giftBoxQty: Number(order.gift_box_qty ?? 0),
      giftBox: Number(order.gift_box_ils ?? 0),
      total: Number(order.total_ils ?? 0),
      provider,
      // What the processor called this attempt, and what settled it. Named
      // generically because the owner reads one email for every rail; both
      // are empty on cash, which has no processor references at all.
      providerOrderRef:
        (provider === "paypal"
          ? order.paypal_order_id
          : provider === "payplus"
            ? order.payplus_page_request_uid
            : null) ?? "",
      providerPaymentRef: paymentRef,
    });
  } catch (error) {
    console.error(
      `[orders] notification for ${order.id} failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}
