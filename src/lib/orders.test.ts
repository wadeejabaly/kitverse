import { describe, expect, it } from "vitest";
import { SHIPPING_ILS_DOMESTIC, cartTotals, priceLine } from "@/data/pricing";
import { getAllProducts, getProduct } from "@/data/catalog";
import type { CheckoutItemInput } from "@/lib/checkout";
import {
  MAX_QTY_SERVER,
  decidePaidTransition,
  isHandledWebhookEvent,
  readWebhookOrderRef,
  repriceCart,
} from "@/lib/orders";
import { MAX_QTY } from "@/components/cart/CartProvider";

/**
 * The money path's unit tests. Three things are being pinned down:
 *
 *   1. the server's recomputation of a cart agrees with cartTotals() for a
 *      realistic mixed basket — this is the number that gets charged;
 *   2. a name & number is re-sanitized on the server whatever the browser
 *      sent, and only a name that survives sanitising is billed for;
 *   3. pending → paid happens exactly once, whichever of the two callers
 *      (capture route, webhook) arrives first.
 */

/** A real visible handle of the requested kind, so the test tracks the catalogue. */
function visibleHandle(kind: "previous" | "current" | "national"): string {
  const product = getAllProducts().find((p) => p.visible && p.kind === kind);
  if (!product) throw new Error(`no visible ${kind} product in the catalogue`);
  return product.handle;
}

function hiddenHandle(): string {
  const product = getAllProducts().find((p) => !p.visible);
  if (!product) throw new Error("no hidden product in the catalogue");
  return product.handle;
}

describe("repriceCart — the server's own arithmetic", () => {
  it("prices a mixed basket (surcharge size + both add-ons) exactly as cartTotals does", () => {
    const previous = visibleHandle("previous");
    const national = visibleHandle("national");

    const items: CheckoutItemInput[] = [
      // previous season, 4XL (+15), name & number (+39), qty 2
      {
        handle: previous,
        size: "4XL",
        version: "player",
        nameNumber: "HAALAND 9",
        badge: false,
        qty: 2,
      },
      // national, 3XL (+15), badge (+19), qty 1
      { handle: national, size: "3XL", version: "fan", badge: true, qty: 1 },
      // plain line, no add-ons
      { handle: previous, size: "M", version: "fan", badge: false, qty: 3 },
    ];

    const cart = repriceCart(items);
    expect(cart.lines).toHaveLength(3);
    expect(cart.dropped).toEqual([]);

    const expected = cartTotals([
      priceLine("previous", "4XL", "player", 2, { nameNumber: true }),
      priceLine("national", "3XL", "fan", 1, { badge: true }),
      priceLine("previous", "M", "fan", 3),
    ]);

    expect(cart.subtotal).toBe(expected.subtotal);
    expect(cart.shipping).toBe(SHIPPING_ILS_DOMESTIC);
    expect(cart.total).toBe(expected.total);

    // previous player 169 + 15 surcharge + 39 print
    expect(cart.lines[0].unitPrice).toBe(223);
    expect(cart.lines[0].lineTotal).toBe(446);
    // national fan 169 + 15 surcharge + 19 badge
    expect(cart.lines[1].unitPrice).toBe(203);
  });

  it("ignores any price-shaped field the client tries to send", () => {
    const handle = visibleHandle("previous");
    const tampered = {
      handle,
      size: "M",
      version: "fan",
      badge: false,
      qty: 1,
      unitPrice: 1,
      lineTotal: 1,
      total: 1,
    } as unknown as CheckoutItemInput;

    const cart = repriceCart([tampered]);
    const product = getProduct(handle);
    expect(product).toBeDefined();
    expect(cart.lines[0].unitPrice).toBe(priceLine("previous", "M", "fan", 1).unitPrice);
    expect(cart.total).toBe(129 + SHIPPING_ILS_DOMESTIC);
  });

  it("drops a hidden handle and an unknown handle rather than pricing them", () => {
    const cart = repriceCart([
      { handle: hiddenHandle(), size: "M", version: "fan", badge: false, qty: 1 },
      { handle: "not-a-real-handle", size: "M", version: "fan", badge: false, qty: 1 },
    ]);
    expect(cart.lines).toHaveLength(0);
    expect(cart.dropped).toHaveLength(2);
    // No lines means no shipping either — an empty order costs nothing.
    expect(cart.total).toBe(0);
  });

  it("clamps quantity to the cart's 1..10 bound", () => {
    const handle = visibleHandle("previous");
    const over = repriceCart([
      { handle, size: "M", version: "fan", badge: false, qty: 999 },
    ]);
    const under = repriceCart([
      { handle, size: "M", version: "fan", badge: false, qty: 0 },
    ]);
    expect(over.lines[0].qty).toBe(MAX_QTY_SERVER);
    expect(under.lines[0].qty).toBe(1);
  });

  it("uses the same maximum quantity as the client cart", () => {
    expect(MAX_QTY_SERVER).toBe(MAX_QTY);
  });
});

describe("repriceCart — sanitizeNameNumber on the server path", () => {
  it("re-sanitizes whatever the client sent: case, punctuation, spacing, length", () => {
    const handle = visibleHandle("previous");
    const cart = repriceCart([
      {
        handle,
        size: "M",
        version: "fan",
        nameNumber: "  o'dea    <script>7  ",
        badge: false,
        qty: 1,
      },
    ]);
    expect(cart.lines[0].nameNumber).toBe("ODEA SCRIPT7");
  });

  it("truncates to the 18-character print limit", () => {
    const handle = visibleHandle("previous");
    const cart = repriceCart([
      {
        handle,
        size: "M",
        version: "fan",
        nameNumber: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        badge: false,
        qty: 1,
      },
    ]);
    expect(cart.lines[0].nameNumber).toBe("ABCDEFGHIJKLMNOPQR");
    expect(cart.lines[0].nameNumber?.length).toBe(18);
  });

  it("does not charge for a name that sanitises away to nothing", () => {
    const handle = visibleHandle("previous");
    const cart = repriceCart([
      { handle, size: "M", version: "fan", nameNumber: "!!! ???", badge: false, qty: 1 },
    ]);
    expect(cart.lines[0].nameNumber).toBeNull();
    // 129, not 129 + 39.
    expect(cart.lines[0].unitPrice).toBe(129);
  });
});

describe("decidePaidTransition — pending → paid, exactly once", () => {
  it("promotes a pending order that has a capture id", () => {
    expect(
      decidePaidTransition({ status: "pending", paypalCaptureId: null }, "CAP-1"),
    ).toEqual({ action: "promote", captureId: "CAP-1" });
  });

  it("is a no-op on an order that is already paid — the duplicate webhook case", () => {
    expect(
      decidePaidTransition({ status: "paid", paypalCaptureId: "CAP-1" }, "CAP-1"),
    ).toEqual({ action: "noop", reason: "already-paid" });
  });

  it("does not overwrite the capture id when a different capture arrives for a paid order", () => {
    const decision = decidePaidTransition(
      { status: "paid", paypalCaptureId: "CAP-1" },
      "CAP-2",
    );
    expect(decision).toEqual({ action: "noop", reason: "already-paid" });
  });

  it("refuses to resurrect a failed or cancelled order", () => {
    expect(
      decidePaidTransition({ status: "failed", paypalCaptureId: null }, "CAP-1"),
    ).toEqual({ action: "noop", reason: "not-pending" });
    expect(
      decidePaidTransition({ status: "cancelled", paypalCaptureId: null }, "CAP-1"),
    ).toEqual({ action: "noop", reason: "not-pending" });
  });

  it("rejects an unknown order and a capture event with no capture id", () => {
    expect(decidePaidTransition(null, "CAP-1")).toEqual({
      action: "reject",
      reason: "unknown-order",
    });
    expect(
      decidePaidTransition({ status: "pending", paypalCaptureId: null }, null),
    ).toEqual({ action: "reject", reason: "missing-capture-id" });
  });

  it("promotes only on the first of two identical deliveries", () => {
    // First delivery sees a pending row.
    const first = decidePaidTransition(
      { status: "pending", paypalCaptureId: null },
      "CAP-9",
    );
    expect(first.action).toBe("promote");
    // The second sees the row the first one left behind.
    const second = decidePaidTransition(
      { status: "paid", paypalCaptureId: "CAP-9" },
      "CAP-9",
    );
    expect(second.action).toBe("noop");
  });
});

describe("webhook event triage", () => {
  it("acts on PAYMENT.CAPTURE.COMPLETED and nothing else", () => {
    expect(isHandledWebhookEvent("PAYMENT.CAPTURE.COMPLETED")).toBe(true);
    expect(isHandledWebhookEvent("PAYMENT.CAPTURE.REFUNDED")).toBe(false);
    expect(isHandledWebhookEvent("CHECKOUT.ORDER.APPROVED")).toBe(false);
    expect(isHandledWebhookEvent(undefined)).toBe(false);
    expect(isHandledWebhookEvent(42)).toBe(false);
  });

  it("prefers custom_id, falls back to invoice_id, and picks up the PayPal order id", () => {
    expect(
      readWebhookOrderRef({
        id: "CAP-1",
        custom_id: "our-uuid",
        invoice_id: "other",
        supplementary_data: { related_ids: { order_id: "PP-1" } },
      }),
    ).toEqual({ orderId: "our-uuid", paypalOrderId: "PP-1", captureId: "CAP-1" });

    expect(readWebhookOrderRef({ id: "CAP-2", invoice_id: "our-uuid" })).toEqual({
      orderId: "our-uuid",
      paypalOrderId: null,
      captureId: "CAP-2",
    });
  });

  it("returns all-null for a malformed resource instead of throwing", () => {
    expect(readWebhookOrderRef(null)).toEqual({
      orderId: null,
      paypalOrderId: null,
      captureId: null,
    });
    expect(readWebhookOrderRef("nonsense")).toEqual({
      orderId: null,
      paypalOrderId: null,
      captureId: null,
    });
  });
});
