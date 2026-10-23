import {
  cartTotals,
  priceLine,
  shippingFor,
  type DeliveryRegion,
  type PricedLine,
} from "@/data/pricing";
import type { Patch, Size, Version } from "@/data/types";
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
  patch: Patch;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface RepricedCart {
  lines: RepricedLine[];
  subtotal: number;
  shipping: number;
  /** The checkout-only gift-box add-on (owner decision 2026-10-23). */
  giftBoxQty: number;
  giftBox: number;
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
 *
 * The patch choice is re-checked against the catalogue too: a patch is only
 * ever billable on a CLUB product (`product.league !== null`), so a national
 * team handle has its `patch` forced to "none" here regardless of what the
 * client sent — the same defence as sanitizeNameNumber above, applied to the
 * other add-on.
 *
 * `giftBoxQty` (owner decision 2026-10-23) is a per-ORDER quantity, not a
 * per-line one, so it is priced once by cartTotals rather than per CheckoutItemInput.
 */
export function repriceCart(
  items: CheckoutItemInput[],
  region: DeliveryRegion,
  giftBoxQty = 0,
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
    const patch: Patch = product.league !== null ? item.patch : "none";

    const priced = priceLine(product.season, item.size, item.version, qty, {
      nameNumber: hasName,
      patch,
    });

    lines.push({
      handle: product.handle,
      title: product.title,
      size: item.size,
      version: item.version,
      nameNumber: hasName ? nameNumber : null,
      patch,
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
  const totals = cartTotals(priced, shippingFor(region), giftBoxQty);

  return { lines, dropped, giftBoxQty: lines.length > 0 ? giftBoxQty : 0, ...totals };
}

/* ------------------------------------------------------ paid transition -- */

/**
 * Owner decision 2026-10-23 replaced the Bit-deposit cash-on-delivery rail
 * (status `awaiting_deposit`, a deposit the buyer sent by Bit before
 * shipping) with PLAIN cash on delivery: no deposit at all, the buyer simply
 * pays the courier in full on arrival. A cash order is therefore written
 * straight to `pending` — the SAME status a freshly-created card order
 * starts in — and nothing below has to special-case it, because the
 * provider check two blocks down (`isSettleableProvider`) already refuses to
 * let any webhook settle a `cash` order regardless of its status. That one
 * check is what used to be carried by the `awaiting_deposit` status; it
 * still holds with one fewer status to reason about.
 */
export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

/**
 * A processor that settles an order over the wire, by a callback this
 * application verifies. PayPlus clears Israeli cards; PayPal is the
 * international one. An order belongs to exactly one of them for its whole
 * life — see the provider check below.
 */
export type SettleableProvider = "paypal" | "payplus";

/**
 * Which rail owns an order. `cash` is deliberately NOT settleable: a cash
 * order is paid by the courier collecting money that never touches this
 * application, so there is no callback and therefore no automated road to
 * `paid` — the owner sets it by hand once they know the delivery went
 * through (or simply leaves it; nothing depends on a cash order ever
 * reaching `paid`). Keeping it out of SettleableProvider means the type
 * system, not a runtime check, is what stops a card webhook from being
 * handed a cash order.
 */
export type PaymentProvider = SettleableProvider | "cash";

export const SETTLEABLE_PROVIDERS: readonly SettleableProvider[] = [
  "paypal",
  "payplus",
];

export const PAYMENT_PROVIDERS: readonly PaymentProvider[] = [
  ...SETTLEABLE_PROVIDERS,
  "cash",
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

/** The provider and status every cash order is created with. */
export const CASH_PROVIDER = "cash" as const satisfies PaymentProvider;
export const CASH_INITIAL_STATUS = "pending" as const satisfies OrderStatus;

export interface CashOrderRow {
  status: typeof CASH_INITIAL_STATUS;
  payment_provider: typeof CASH_PROVIDER;
}

/**
 * The provider half of a cash-on-delivery order row.
 *
 * It lives here, rather than as a literal inline in the route, so it can be
 * unit-tested: the route has no other provider literal in it, so proving
 * this function always returns `cash` is proving the cash-on-delivery path
 * cannot create a card-provider order.
 */
export function cashOrderRow(): CashOrderRow {
  return { status: CASH_INITIAL_STATUS, payment_provider: CASH_PROVIDER };
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
 * rail. A `cash` order is paid to the courier, not through any processor this
 * application can verify, so no callback on any endpoint may promote one —
 * and the check is written against the ORDER's provider rather than the
 * caller's, so it holds even if some future caller passes a provider it
 * should not have.
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
