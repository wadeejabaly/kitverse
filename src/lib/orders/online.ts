import "server-only";
import { db, must } from "../db";
import { notify } from "../notify";
import { orderReference } from "../checkout";
import { orderLink, orderToken } from "./link";
import { prepareOrder, type PrepareFailure } from "./web";
import type { CreateOrderRequest } from "../checkout";
import type { OrderRow } from "./draft";

/**
 * The PayPal / Bit (PayPlus) half of website checkout — the two rails where
 * money does not move at the moment the order is written (see web.ts for
 * cash, which settles instantly). Both share prepareOrder() from web.ts for
 * everything up to pricing; this module starts where that leaves off:
 * marking which rail the order is on, minting the PSP's own payment
 * link/order, and - the part that actually matters - deciding once, and
 * only once, that money has really moved before the order can reach the
 * owner's approval queue.
 *
 * Owner decision 2026-10-31 (Part 7).
 */

export type OnlineProvider = "paypal" | "bit";

export type CreatePendingResult =
  | ({ ok: true } & {
      order: OrderRow;
      totalAgorot: number;
      reference: string;
      customerName: string;
      customerEmail: string;
      token: string;
      url: string;
    })
  | PrepareFailure;

/**
 * Write the order exactly like createWebOrder does, but stop short of
 * approving anything: payment_method records which rail it's on, the order
 * stays wherever prepareOrder/requote left it ("quoted" - draft bumped the
 * moment it has lines, supabase/migrations/20260930120000_core_schema.sql),
 * and payment_status stays its default "unpaid". Nothing is charged yet and
 * the owner is not notified yet - see settleOnlinePayment for the only path
 * that can change either.
 */
export async function createPendingOnlineOrder(
  req: CreateOrderRequest,
  provider: OnlineProvider,
): Promise<CreatePendingResult> {
  const prepared = await prepareOrder(req);
  if (!prepared.ok) return prepared;
  const { order, q } = prepared;

  const row = must(
    await db().from("orders").update({ payment_method: provider, total: q.total }).eq("id", order.id).select("*").single(),
    "price online order",
  ) as OrderRow;

  return {
    ok: true,
    order: row,
    totalAgorot: q.total,
    reference: orderReference(order.id),
    customerName: req.customer.name,
    customerEmail: req.customer.email,
    token: orderToken(order.id),
    url: orderLink(order.id),
  };
}

/**
 * Record that a payment attempt exists, before we know whether it will ever
 * be paid - the row the provider's own id (PayPal order id / PayPlus page
 * request uid) points back to when a webhook or a browser return arrives.
 * Safe to call more than once for the same attempt: the one row this order
 * needs is found and reused, not duplicated, by (order_id, provider) while
 * it's still pending.
 */
export async function recordPendingPayment(orderId: string, provider: OnlineProvider, providerOrderId: string, amountAgorot: number): Promise<void> {
  const existing = await db().from("payments").select("id").eq("order_id", orderId).eq("provider", provider).eq("status", "pending").maybeSingle();
  if (existing.data) {
    must(await db().from("payments").update({ provider_order_id: providerOrderId, amount: amountAgorot }).eq("id", (existing.data as { id: string }).id).select("id"), "update pending payment");
    return;
  }
  must(
    await db().from("payments").insert({ order_id: orderId, provider, provider_order_id: providerOrderId, amount: amountAgorot, status: "pending" }).select("id"),
    "record pending payment",
  );
}

/** The provider's own id for this order's still-pending attempt (PayPal order id / PayPlus page request uid), recorded by recordPendingPayment. Null if there isn't one — a stale or guessed return link, say. */
export async function getPendingProviderOrderId(orderId: string, provider: OnlineProvider): Promise<string | null> {
  const r = await db().from("payments").select("provider_order_id").eq("order_id", orderId).eq("provider", provider).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new Error(`getPendingProviderOrderId: ${r.error.message}`);
  const row = r.data as { provider_order_id: string | null } | null;
  return row?.provider_order_id ?? null;
}

/** What a settlement caller needs to verify a PayPlus verdict, or to sanity-check a PayPal capture, against. */
export async function getOrderForSettlement(orderId: string): Promise<{ id: string; number: number; totalAgorot: number; paymentStatus: string } | null> {
  const r = await db().from("orders").select("id,number,total,payment_status").eq("id", orderId).maybeSingle();
  if (r.error) throw new Error(`getOrderForSettlement: ${r.error.message}`);
  if (!r.data) return null;
  const row = r.data as { id: string; number: number; total: number; payment_status: string };
  return { id: row.id, number: row.number, totalAgorot: row.total, paymentStatus: row.payment_status };
}

export type SettleResult = { ok: true; alreadySettled: boolean; order: OrderRow | null };

/**
 * The one place an online order is allowed to become real. Called ONLY after
 * a caller has independently verified the money moved - captureOrder()'s
 * "COMPLETED" status for PayPal, decidePayPlusVerdict()'s paid:true for Bit -
 * never from a redirect query string or a webhook body alone.
 *
 * The UPDATE's own WHERE clause (payment_status = 'unpaid') is the
 * idempotency: a browser capture racing a webhook, or a redelivered webhook,
 * both call this, and only the one whose UPDATE actually matches a row gets
 * alreadySettled: false and triggers the owner notification - every other
 * caller sees zero rows affected and does nothing more. The payments row's
 * own unique index on (provider, capture_id)
 * (supabase/migrations/20260930120000_core_schema.sql) backs that up: a
 * second insert attempt for the same settlement throws and is swallowed here
 * rather than recorded twice.
 */
export async function settleOnlinePayment(opts: {
  orderId: string;
  provider: OnlineProvider;
  providerOrderId: string | null;
  captureId: string;
  amountAgorot: number;
  raw: unknown;
}): Promise<SettleResult> {
  const updated = await db()
    .from("orders")
    .update({ payment_status: "paid", status: "awaiting_confirmation" })
    .eq("id", opts.orderId)
    .eq("payment_status", "unpaid")
    .select("*");
  if (updated.error) throw new Error(`settle online payment: ${updated.error.message}`);
  const row = ((updated.data as OrderRow[] | null) ?? [])[0] ?? null;

  try {
    must(
      await db()
        .from("payments")
        .insert({
          order_id: opts.orderId,
          provider: opts.provider,
          provider_order_id: opts.providerOrderId,
          capture_id: opts.captureId,
          amount: opts.amountAgorot,
          status: "completed",
          raw: opts.raw as object,
          verified_at: new Date().toISOString(),
        })
        .select("id"),
      "payment row",
    );
  } catch (e) {
    // payments_one_capture (provider, capture_id) - this exact settlement was already recorded by the other caller in the race.
    if (!/duplicate key|payments_one_capture/i.test((e as Error).message)) throw e;
  }

  if (!row) return { ok: true, alreadySettled: true, order: null };

  const address = row.address as { full_name?: string; town?: string } | null;
  await notify({
    kind: "order.needs_approval",
    priority: "urgent",
    title: `Approve order #${row.number} - ₪${row.total / 100}`,
    body: `${address?.full_name ?? ""}, ${address?.town ?? ""} · ${opts.provider === "paypal" ? "PayPal" : "Bit"} - paid, waiting for your OK`,
    link: `/admin/orders/${row.id}`,
  });
  return { ok: true, alreadySettled: false, order: row };
}

export type OrderPublicState = { number: number; method: "cod" | "paypal" | "bit" | null; paid: boolean; status: string };

/**
 * What the thank-you page (and the payment-return routes) are allowed to
 * know about an order from its id alone: no name, address, email or total -
 * see the doc comment on checkout/thank-you/page.tsx for why.
 */
export async function orderPublicState(orderId: string): Promise<OrderPublicState | null> {
  const r = await db().from("orders").select("number,payment_method,payment_status,status").eq("id", orderId).maybeSingle();
  if (r.error) throw new Error(`orderPublicState: ${r.error.message}`);
  if (!r.data) return null;
  const row = r.data as { number: number; payment_method: "cod" | "paypal" | "bit" | null; payment_status: string; status: string };
  return { number: row.number, method: row.payment_method, paid: row.payment_status === "paid" || row.payment_status === "deposit_paid", status: row.status };
}
