import { cartTotals, priceLine, type PricedLine } from "@/data/pricing";
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
 */
export function repriceCart(items: CheckoutItemInput[]): RepricedCart {
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

    const priced = priceLine(product.kind, item.size, item.version, qty, {
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
  const totals = cartTotals(priced);

  return { lines, dropped, ...totals };
}

/* ------------------------------------------------------ paid transition -- */

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

/**
 * Which processor owns an order. PayPlus clears Israeli cards and is the
 * primary method; PayPal is the international one. An order belongs to
 * exactly one of them for its whole life — see the provider check below.
 */
export type PaymentProvider = "paypal" | "payplus";

export const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ["paypal", "payplus"];

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return typeof value === "string" && (PAYMENT_PROVIDERS as string[]).includes(value);
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
      reason: "unknown-order" | "missing-reference" | "provider-mismatch";
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
 */
export function decidePaidTransition(
  order: OrderStateSnapshot | null,
  reference: string | null,
  provider: PaymentProvider,
): PaidDecision {
  if (!order) return { action: "reject", reason: "unknown-order" };
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
