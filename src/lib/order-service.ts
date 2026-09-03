import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderReference } from "@/lib/checkout";
import { notifyOwnerOfOrder, type NotificationItem } from "@/lib/notify";
import {
  COD_PROVIDER,
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
  "id, status, payment_provider, paypal_order_id, paypal_capture_id, payplus_page_request_uid, payplus_transaction_uid, customer_name, email, phone, address, city, delivery_region, country, notes, locale, subtotal_ils, shipping_ils, total_ils, deposit_ils";

/**
 * Where each settleable provider records the payment that closed an order. The
 * PayPal column is the capture; the PayPlus column is the transaction. Both
 * are unique in the schema, so one payment can never close two orders.
 *
 * `bit_cod` is absent by construction — it is not a SettleableProvider, has no
 * reference column, and is settled by the owner in the dashboard.
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
  /** COD only: the Bit deposit this order is waiting for. Null otherwise. */
  deposit: number | null;
}

/**
 * The confirmation page's question: what state is the order behind this
 * reference in? Returns the status, the rail, and — for cash on delivery
 * only — the deposit figure, and NOTHING else. No name, no email, no address,
 * and not the order total, because the short reference travels in a URL that
 * gets shared and logged.
 *
 * The deposit is here because the COD confirmation cannot be written without
 * it: the buyer has to be told the exact amount to send by Bit, and the page
 * must read it from the row the server wrote rather than trust a figure the
 * browser carried over from checkout. It is one of three fixed tier values, so
 * it discloses only a coarse band of the order total to anyone holding the
 * reference — which is the price of the page working at all, and is paid only
 * on COD orders.
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
    .select("status, payment_provider, deposit_ils")
    .eq("reference", reference)
    .limit(2);

  if (error) {
    console.error(`[orders] reference lookup failed:`, error.message);
    return null;
  }

  const rows =
    (data as
      | { status: OrderStatus; payment_provider: string | null; deposit_ils: number | null }[]
      | null) ?? [];
  if (rows.length !== 1) return null;

  const row = rows[0];
  const provider: PaymentProvider = isPaymentProvider(row.payment_provider)
    ? row.payment_provider
    : "paypal";
  const deposit = row.deposit_ils === null ? null : Number(row.deposit_ils);

  return {
    status: row.status,
    provider,
    deposit: provider === "bit_cod" && Number.isFinite(deposit) ? deposit : null,
  };
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
 * This is the one notification that does NOT wait for money. It cannot: a COD
 * order is settled by the owner recognising a Bit transfer, so if they are not
 * told the order exists there is nothing for the deposit to be matched
 * against. The card paths stay the other way round — they notify on payment,
 * because until then nothing has happened worth an email.
 *
 * Reads the row back rather than trusting what the route had in hand, so the
 * email describes what was actually written. Swallows every failure: an order
 * that exists is not un-made by a mail provider having a bad minute.
 */
export async function announceCodOrder(
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
      console.error(`[orders] COD notification: order ${orderId} vanished`);
      return;
    }
    await sendOwnerNotification(db, order, COD_PROVIDER, "");
  } catch (error) {
    console.error(
      `[orders] COD notification for ${orderId} failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Build and send the owner's order email. Wrapped end to end: a failure to
 * read the lines back, or to send, is logged and swallowed — the order is
 * paid (or, for COD, placed) either way.
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

    await notifyOwnerOfOrder({
      reference: orderReference(order.id),
      orderId: order.id,
      locale: order.locale ?? "ar",
      customer: {
        name: order.customer_name ?? "",
        email: order.email ?? "",
        phone: order.phone ?? "",
        address: order.address ?? "",
        city: order.city ?? "",
        region: order.delivery_region ?? "",
        country: order.country ?? "IL",
        notes: order.notes,
      },
      items,
      subtotal: Number(order.subtotal_ils ?? 0),
      shipping: Number(order.shipping_ils ?? 0),
      total: Number(order.total_ils ?? 0),
      // COD only. The email leads with it, because it is the one figure the
      // owner has to match against their Bit account by hand.
      deposit: order.deposit_ils === null ? null : Number(order.deposit_ils),
      provider,
      // What the processor called this attempt, and what settled it. Named
      // generically because the owner reads one email for every rail; both are
      // empty on COD, which has no processor references at all.
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
