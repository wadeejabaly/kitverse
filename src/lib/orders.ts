import {
  bitDepositFor,
  cartTotals,
  priceLine,
  shippingFor,
  type DeliveryRegion,
  type PricedLine,
} from "@/data/pricing";
import type { Size, Version } from "@/data/types";
import { getProduct } from "@/data/catalog";
import { sanitizeNameNumber } from "@/lib/product";
import type { CheckoutItemInput } from "@/lib/checkout";

/**
 * Server-side order logic: what a cart actually costs, and when an order is
 * allowed to become paid.
 *
 * This module imports the catalogue, so it belongs to the server side of the
 * app — API routes and tests, never a client component (importing it into one
 * would drag catalog.json into the browser bundle). It carries no secrets, so
 * it is not marked `server-only`: the unit tests need to import it.
 *
 * THE RULE THIS FILE EXISTS FOR: the browser sends choices, never prices. Any
 * total it displayed is a courtesy to the customer and is discarded here. The
 * number sent to PayPal is computed below, from the catalogue and pricing.ts.
 */

/** The client cart's per-line ceiling (CartProvider's MAX_QTY). */
export const MAX_QTY_SERVER = 10;

export interface RepricedLine {
  handle: string;
  /** English title, snapshotted onto the order row. */
  title: string;
  size: Size;
  version: Version;
  nameNumber: string | null;
  badge: boolean;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface RepricedCart {
  lines: RepricedLine[];
  subtotal: number;
  shipping: number;
  total: number;
  /** Handles that were dropped, for server-side logging only. */
  dropped: string[];
}

/**
 * Recompute a cart from scratch.
 *
 * Mirrors the client's own rules exactly, because the two disagreeing is how
 * a customer gets charged something they never saw:
 *   - a handle that is not a VISIBLE catalogue product is dropped, not priced
 *     (the same skip CartView does — an unapproved shirt cannot be sold);
 *   - every nameNumber is re-sanitized here, whatever the client sent;
 *   - qty is clamped to 1..10, the cart's own bound.
 *
 * The addon flags follow the sanitized value: an empty name after sanitising
 * is no personalisation, so it is not charged for.
 *
 * Shipping is priced here too, from the `region` the request declared — which
 * CustomerSchema has already checked against pricing.ts's closed set, so an
 * unknown region never reaches this function and no order can be shipped at a
 * rate the store did not publish. The line price itself comes from the
 * PRODUCT'S OWN `season` read out of the catalogue, never from anything the
 * browser sent.
 */
export function repriceCart(
  items: CheckoutItemInput[],
  region: DeliveryRegion,
): RepricedCart {
  const lines: RepricedLine[] = [];
  const dropped: string[] = [];

  for (const item of items) {
    const product = getProduct(item.handle);
    if (!product || !product.visible) {
      dropped.push(item.handle);
      continue;
    }

    const nameNumber = item.nameNumber
      ? sanitizeNameNumber(item.nameNumber).trim()
      : "";
    const hasName = nameNumber !== "";
    const qty = Math.min(MAX_QTY_SERVER, Math.max(1, Math.floor(item.qty)));

    const priced = priceLine(product.season, item.size, item.version, qty, {
      nameNumber: hasName,
      badge: item.badge,
    });

    lines.push({
      handle: product.handle,
      title: product.title,
      size: item.size,
      version: item.version,
      nameNumber: hasName ? nameNumber : null,
      badge: item.badge,
      qty,
      unitPrice: priced.unitPrice,
      lineTotal: priced.lineTotal,
    });
  }

  const priced: PricedLine[] = lines.map((line) => ({
    unitPrice: line.unitPrice,
    qty: line.qty,
    lineTotal: line.lineTotal,
  }));
  const totals = cartTotals(priced, shippingFor(region));

  return { lines, dropped, ...totals };
}

/* ------------------------------------------------------ paid transition -- */

/**
 * `awaiting_deposit` (migration 0004) belongs to cash on delivery and to
 * nothing else: the order is placed and reserved, and it is waiting for a Bit
 * transfer that arrives OUTSIDE this application. The owner sees the money in
 * their own Bit account and flips the row to `paid` by hand in the Supabase
 * dashboard — no code path promotes it, which is exactly why the automated
 * settlement below refuses to touch such an order at all.
 */
export type OrderStatus =
  | "pending"
  | "awaiting_deposit"
  | "paid"
  | "failed"
  | "cancelled";

/**
 * A processor that settles an order over the wire, by a callback this
 * application verifies. PayPlus clears Israeli cards; PayPal is the
 * international one. An order belongs to exactly one of them for its whole
 * life — see the provider check below.
 */
export type SettleableProvider = "paypal" | "payplus";

/**
 * Which rail owns an order. `bit_cod` is deliberately NOT settleable: Bit has
 * no API here, there is no callback to verify and therefore no automated road
 * from `awaiting_deposit` to `paid`. Keeping it out of SettleableProvider
 * means the type system, not a runtime check, is what stops a card webhook
 * from being handed a COD order.
 */
export type PaymentProvider = SettleableProvider | "bit_cod";

export const SETTLEABLE_PROVIDERS: readonly SettleableProvider[] = [
  "paypal",
  "payplus",
];

export const PAYMENT_PROVIDERS: readonly PaymentProvider[] = [
  ...SETTLEABLE_PROVIDERS,
  "bit_cod",
];

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return typeof value === "string" && (PAYMENT_PROVIDERS as string[]).includes(value);
}

export function isSettleableProvider(value: unknown): value is SettleableProvider {
  return (
    typeof value === "string" && (SETTLEABLE_PROVIDERS as string[]).includes(value)
  );
}

/* -------------------------------------------------- cash on delivery -- */

/** The provider and status every COD order is created with, and the only ones. */
export const COD_PROVIDER = "bit_cod" as const satisfies PaymentProvider;
export const COD_INITIAL_STATUS = "awaiting_deposit" as const satisfies OrderStatus;

export interface CodOrderRow {
  status: typeof COD_INITIAL_STATUS;
  payment_provider: typeof COD_PROVIDER;
  deposit_ils: number;
}

/**
 * The provider-and-money half of a cash-on-delivery order row.
 *
 * It lives here rather than inline in the route so it can be unit-tested: the
 * route has no other provider literal in it, so proving this function returns
 * `bit_cod` for every input is proving the COD path cannot create a card
 * order. The deposit is computed from the total the SERVER just repriced —
 * `bitDepositFor` is never handed a figure that came off the wire.
 */
export function codOrderRow(serverTotal: number): CodOrderRow {
  return {
    status: COD_INITIAL_STATUS,
    payment_provider: COD_PROVIDER,
    deposit_ils: bitDepositFor(serverTotal),
  };
}

/** The order facts the confirmation page reads back for a reference. */
export interface OrderStateForConfirmation {
  status: OrderStatus;
  provider: PaymentProvider;
  deposit: number | null;
}

/** Everything the buyer needs in order to pay: where, and how much. */
export interface CodConfirmation {
  deposit: number;
  phone: string;
}

/**
 * Should the confirmation page show the "send your Bit deposit" state?
 *
 * Only when all four facts line up: the order exists, it is on the COD rail,
 * it is still waiting for the deposit, a deposit was actually recorded on the
 * row, and the store has a number to send it to. Anything short of that is
 * null, and the page falls back to its holding copy rather than inventing
 * instructions or naming an amount it cannot source from the database.
 *
 * Pure, so the gate is unit-tested rather than only reachable through a live
 * Supabase project. NOTE what is NOT an input: anything the browser carried
 * over from checkout. Both the deposit and the phone number come from the
 * server — the order row and server-only env respectively.
 */
export function codConfirmationFor(
  state: OrderStateForConfirmation | null,
  bitPhone: string | null,
): CodConfirmation | null {
  if (!state) return null;
  if (state.provider !== COD_PROVIDER) return null;
  if (state.status !== COD_INITIAL_STATUS) return null;
  if (state.deposit === null || !(state.deposit > 0)) return null;
  if (!bitPhone) return null;
  return { deposit: state.deposit, phone: bitPhone };
}

/** The order facts the transition decision needs — nothing else. */
export interface OrderStateSnapshot {
  status: OrderStatus;
  /** The processor this order was created for. */
  provider: PaymentProvider;
  /** The provider reference already recorded, if the order is settled. */
  settledRef: string | null;
}

export type PaidDecision =
  /** Write status='paid' guarded by `WHERE status='pending'`. */
  | { action: "promote"; reference: string }
  /** Already settled, or settled by another delivery of the same event. */
  | { action: "noop"; reason: "already-paid" | "not-pending" }
  /** Nothing to act on: refuse and say why. */
  | {
      action: "reject";
      reason:
        | "unknown-order"
        | "missing-reference"
        | "provider-mismatch"
        /** A cash-on-delivery order. Settled by hand, never by a callback. */
        | "manual-provider";
    };

/**
 * Should this order become paid?
 *
 * Pure on purpose. Three roads reach a pending→paid moment — the browser's
 * PayPal onApprove, PayPal's webhook, and PayPlus's callback — and they must
 * behave identically when the same payment arrives twice. PayPal's onApprove
 * and its webhook routinely race, and both processors re-deliver a callback
 * they believe failed. Keeping the decision here (and unit-testing it) makes
 * idempotency a property of one small function rather than of three network
 * handlers.
 *
 * A "paid" order is never re-promoted, whichever reference arrives second:
 * the first payment is the one that took the money, and overwriting its
 * reference would lose what reconciles the books.
 *
 * THE PROVIDER CHECK is not bookkeeping. Two processors now post to two public
 * webhooks, and an order created for one of them must not be settleable by an
 * event from the other — otherwise a forged or misrouted PayPal event could
 * close a PayPlus order that nobody ever paid for, and vice versa. The
 * mismatch is a rejection, never a no-op.
 *
 * THE MANUAL-PROVIDER CHECK is the same argument for the cash-on-delivery
 * rail. A `bit_cod` order is settled by a human reading their Bit account,
 * so no callback on any endpoint may promote one — and the check is written
 * against the ORDER's provider rather than the caller's, so it holds even if
 * some future caller passes a provider it should not have.
 */
export function decidePaidTransition(
  order: OrderStateSnapshot | null,
  reference: string | null,
  provider: SettleableProvider,
): PaidDecision {
  if (!order) return { action: "reject", reason: "unknown-order" };
  if (!isSettleableProvider(order.provider)) {
    return { action: "reject", reason: "manual-provider" };
  }
  if (order.provider !== provider) {
    return { action: "reject", reason: "provider-mismatch" };
  }
  if (order.status === "paid") return { action: "noop", reason: "already-paid" };
  if (order.status !== "pending") return { action: "noop", reason: "not-pending" };
  if (!reference) return { action: "reject", reason: "missing-reference" };
  return { action: "promote", reference };
}

/**
 * Which PayPal webhook events this store acts on. Everything else — refunds,
 * disputes, order-approved chatter — is acknowledged with a 200 and ignored,
 * because a 4xx or 5xx makes PayPal retry an event we were never going to act
 * on.
 */
export const HANDLED_WEBHOOK_EVENTS = new Set(["PAYMENT.CAPTURE.COMPLETED"]);

export function isHandledWebhookEvent(eventType: unknown): boolean {
  return typeof eventType === "string" && HANDLED_WEBHOOK_EVENTS.has(eventType);
}

export interface WebhookOrderRef {
  /** Our own order uuid, from invoice_id/custom_id — the preferred route. */
  orderId: string | null;
  /** PayPal's order id, from supplementary_data — the fallback route. */
  paypalOrderId: string | null;
  /** The capture that completed. */
  captureId: string | null;
}

/**
 * Pull the identifiers out of a PAYMENT.CAPTURE.COMPLETED resource.
 *
 * Only called AFTER the signature has been verified — the shape is unknown
 * either way, so every field is read defensively.
 */
export function readWebhookOrderRef(resource: unknown): WebhookOrderRef {
  if (typeof resource !== "object" || resource === null) {
    return { orderId: null, paypalOrderId: null, captureId: null };
  }
  const value = resource as {
    id?: unknown;
    custom_id?: unknown;
    invoice_id?: unknown;
    supplementary_data?: { related_ids?: { order_id?: unknown } };
  };

  const orderId =
    typeof value.custom_id === "string" && value.custom_id !== ""
      ? value.custom_id
      : typeof value.invoice_id === "string" && value.invoice_id !== ""
        ? value.invoice_id
        : null;

  const related = value.supplementary_data?.related_ids?.order_id;

  return {
    orderId,
    paypalOrderId: typeof related === "string" && related !== "" ? related : null,
    captureId: typeof value.id === "string" && value.id !== "" ? value.id : null,
  };
}
