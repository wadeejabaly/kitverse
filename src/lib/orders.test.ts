import { describe, expect, it } from "vitest";
import { cartTotals, priceLine, shippingFor } from "@/data/pricing";
import { getAllProducts, getProduct } from "@/data/catalog";
import type { CheckoutItemInput } from "@/lib/checkout";
import {
  CASH_PROVIDER,
  MAX_QTY_SERVER,
  SETTLEABLE_PROVIDERS,
  cashOrderRow,
  decidePaidTransition,
  isHandledWebhookEvent,
  isPaymentProvider,
  isSettleableProvider,
  readWebhookOrderRef,
  repriceCart,
  type OrderStateSnapshot,
  type OrderStatus,
  type PaymentProvider,
} from "@/lib/orders";
import { MAX_QTY } from "@/components/cart/CartProvider";

/**
 * The money path's unit tests. Three things are being pinned down:
 *
 *   1. the server's recomputation of a cart agrees with cartTotals() for a
 *      realistic mixed basket — this is the number that gets charged;
 *   2. a name & number is re-sanitized on the server whatever the browser
 *      sent, and only a name that survives sanitising is billed for, and a
 *      patch is only ever billable on a club product;
 *   3. pending → paid happens exactly once, whichever of the three callers
 *      (PayPal capture route, PayPal webhook, PayPlus callback) arrives
 *      first — and only for the processor the order was created for, and
 *      NEVER for cash on delivery.
 */

/**
 * A real visible handle of the requested kind, so the test tracks the
 * catalogue. Kind no longer drives price, so these tests only need two
 * visible products of *different* kinds to prove that — which kind doesn't
 * matter. Call sites below use "current" + "national" because the 2026/27
 * rebuild has not re-added a "previous"-season kit yet (owner's rollout
 * plan adds 2025/26 next); "previous" stays in the type for when it does.
 */
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

/** The region every test here checks out to, unless it varies it on purpose. */
const REGION = "center";

describe("repriceCart — the server's own arithmetic", () => {
  it("prices a mixed basket (surcharge size + both add-ons) exactly as cartTotals does", () => {
    const clubHandle = visibleHandle("current");
    const nationalHandle = visibleHandle("national");
    const clubSeason = getProduct(clubHandle)!.season;
    const nationalSeason = getProduct(nationalHandle)!.season;

    const items: CheckoutItemInput[] = [
      // 4XL (+12), name & number (+20), qty 2
      {
        handle: clubHandle,
        size: "4XL",
        version: "player",
        nameNumber: "HAALAND 9",
        patch: "none",
        qty: 2,
      },
      // 3XL (+9), league patch (+11.99), qty 1 — a club product, so the
      // patch is billable.
      { handle: clubHandle, size: "3XL", version: "fan", patch: "league", qty: 1 },
      // a national-team line: no league, so no patch regardless of what is
      // requested — this is the forced-to-"none" guarantee, exercised again
      // in its own describe block below.
      { handle: nationalHandle, size: "M", version: "fan", patch: "ucl", qty: 3 },
    ];

    const cart = repriceCart(items, REGION);
    expect(cart.lines).toHaveLength(3);
    expect(cart.dropped).toEqual([]);

    const expected = cartTotals(
      [
        priceLine(clubSeason, "4XL", "player", 2, { nameNumber: true }),
        priceLine(clubSeason, "3XL", "fan", 1, { patch: "league" }),
        priceLine(nationalSeason, "M", "fan", 3),
      ],
      shippingFor(REGION),
    );

    expect(cart.subtotal).toBe(expected.subtotal);
    expect(cart.shipping).toBe(shippingFor(REGION));
    expect(cart.total).toBe(expected.total);

    // player 110 + 12 surcharge + 20 print
    expect(cart.lines[0].unitPrice).toBe(142);
    expect(cart.lines[0].lineTotal).toBe(284);
    // fan 95 + 9 surcharge + 11.99 league patch
    expect(cart.lines[1].unitPrice).toBe(95 + 9 + 11.99);
    // national line: "ucl" was requested but the product has no league, so
    // it is billed as plain fan price with no patch at all.
    expect(cart.lines[2].patch).toBe("none");
    expect(cart.lines[2].unitPrice).toBe(priceLine(nationalSeason, "M", "fan", 1).unitPrice);
  });

  it("forces a patch to \"none\" for a national-team product, whatever the client requested", () => {
    const nationalHandle = visibleHandle("national");
    for (const requested of ["league", "ucl"] as const) {
      const cart = repriceCart(
        [{ handle: nationalHandle, size: "M", version: "fan", patch: requested, qty: 1 }],
        REGION,
      );
      expect(cart.lines[0].patch).toBe("none");
    }
  });

  it("ignores any price-shaped field the client tries to send", () => {
    const handle = visibleHandle("current");
    const season = getProduct(handle)!.season;
    const tampered = {
      handle,
      size: "M",
      version: "fan",
      patch: "none",
      qty: 1,
      unitPrice: 1,
      lineTotal: 1,
      total: 1,
    } as unknown as CheckoutItemInput;

    const cart = repriceCart([tampered], REGION);
    const product = getProduct(handle);
    expect(product).toBeDefined();
    expect(cart.lines[0].unitPrice).toBe(priceLine(season, "M", "fan", 1).unitPrice);
    expect(cart.total).toBe(95 + shippingFor(REGION));
  });

  it("drops a hidden handle and an unknown handle rather than pricing them", () => {
    const cart = repriceCart(
      [
        { handle: hiddenHandle(), size: "M", version: "fan", patch: "none", qty: 1 },
        { handle: "not-a-real-handle", size: "M", version: "fan", patch: "none", qty: 1 },
      ],
      REGION,
    );
    expect(cart.lines).toHaveLength(0);
    expect(cart.dropped).toHaveLength(2);
    // No lines means no shipping either — an empty order costs nothing.
    expect(cart.total).toBe(0);
  });

  it("prices shipping by the region passed in, not a flat figure", () => {
    const handle = visibleHandle("national");
    const forRegion = (region: Parameters<typeof shippingFor>[0]) =>
      repriceCart([{ handle, size: "M", version: "fan", patch: "none", qty: 1 }], region)
        .shipping;
    expect(forRegion("north")).toBe(50);
    expect(forRegion("center")).toBe(60);
    expect(forRegion("negev")).toBe(70);
    expect(forRegion("jerusalem")).toBe(100);
  });

  it("prices a line from the catalogue's season, ignoring the product's kind", () => {
    // kind no longer drives price: two visible products of DIFFERENT kinds but
    // the same season must reprice to the same unit price.
    const byKindAndSeason = new Map<string, string>();
    for (const product of getAllProducts()) {
      if (!product.visible) continue;
      const existing = byKindAndSeason.get(product.season);
      if (existing && getProduct(existing)!.kind !== product.kind) {
        const a = repriceCart(
          [{ handle: existing, size: "M", version: "fan", patch: "none", qty: 1 }],
          REGION,
        );
        const b = repriceCart(
          [{ handle: product.handle, size: "M", version: "fan", patch: "none", qty: 1 }],
          REGION,
        );
        expect(a.lines[0].unitPrice).toBe(b.lines[0].unitPrice);
        return;
      }
      if (!existing) byKindAndSeason.set(product.season, product.handle);
    }
  });

  it("clamps quantity to the cart's 1..10 bound", () => {
    const handle = visibleHandle("current");
    const over = repriceCart(
      [{ handle, size: "M", version: "fan", patch: "none", qty: 999 }],
      REGION,
    );
    const under = repriceCart(
      [{ handle, size: "M", version: "fan", patch: "none", qty: 0 }],
      REGION,
    );
    expect(over.lines[0].qty).toBe(MAX_QTY_SERVER);
    expect(under.lines[0].qty).toBe(1);
  });

  it("uses the same maximum quantity as the client cart", () => {
    expect(MAX_QTY_SERVER).toBe(MAX_QTY);
  });

  describe("the checkout-only gift-box add-on", () => {
    it("prices zero gift boxes by default", () => {
      const handle = visibleHandle("current");
      const cart = repriceCart(
        [{ handle, size: "M", version: "fan", patch: "none", qty: 1 }],
        REGION,
      );
      expect(cart.giftBoxQty).toBe(0);
      expect(cart.giftBox).toBe(0);
    });

    it("prices the requested quantity of boxes, once per order", () => {
      const handle = visibleHandle("current");
      const cart = repriceCart(
        [{ handle, size: "M", version: "fan", patch: "none", qty: 1 }],
        REGION,
        2,
      );
      expect(cart.giftBoxQty).toBe(2);
      expect(cart.giftBox).toBeGreaterThan(0);
      expect(cart.total).toBe(
        cartTotals(
          [priceLine(getProduct(handle)!.season, "M", "fan", 1)],
          shippingFor(REGION),
          2,
        ).total,
      );
    });

    it("never charges for a gift box on an empty/dropped cart", () => {
      const cart = repriceCart(
        [{ handle: "not-a-real-handle", size: "M", version: "fan", patch: "none", qty: 1 }],
        REGION,
        3,
      );
      expect(cart.giftBoxQty).toBe(0);
      expect(cart.giftBox).toBe(0);
      expect(cart.total).toBe(0);
    });
  });
});

describe("repriceCart — sanitizeNameNumber on the server path", () => {
  it("re-sanitizes whatever the client sent: case, punctuation, spacing, length", () => {
    const handle = visibleHandle("current");
    const cart = repriceCart(
      [
        {
          handle,
          size: "M",
          version: "fan",
          nameNumber: "  o'dea    <script>7  ",
          patch: "none",
          qty: 1,
        },
      ],
      REGION,
    );
    expect(cart.lines[0].nameNumber).toBe("ODEA SCRIPT7");
  });

  it("truncates to the 18-character print limit", () => {
    const handle = visibleHandle("current");
    const cart = repriceCart(
      [
        {
          handle,
          size: "M",
          version: "fan",
          nameNumber: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
          patch: "none",
          qty: 1,
        },
      ],
      REGION,
    );
    expect(cart.lines[0].nameNumber).toBe("ABCDEFGHIJKLMNOPQR");
    expect(cart.lines[0].nameNumber?.length).toBe(18);
  });

  it("does not charge for a name that sanitises away to nothing", () => {
    const handle = visibleHandle("current");
    const cart = repriceCart(
      [{ handle, size: "M", version: "fan", nameNumber: "!!! ???", patch: "none", qty: 1 }],
      REGION,
    );
    expect(cart.lines[0].nameNumber).toBeNull();
    // Fan 95, not 95 + 20.
    expect(cart.lines[0].unitPrice).toBe(95);
  });
});

describe("decidePaidTransition — pending → paid, exactly once", () => {
  /** An order row as the transition sees it. */
  const order = (
    status: OrderStatus,
    provider: PaymentProvider = "paypal",
    settledRef: string | null = null,
  ): OrderStateSnapshot => ({ status, provider, settledRef });

  it("promotes a pending order that has a payment reference", () => {
    expect(decidePaidTransition(order("pending"), "CAP-1", "paypal")).toEqual({
      action: "promote",
      reference: "CAP-1",
    });
  });

  it("is a no-op on an order that is already paid — the duplicate webhook case", () => {
    expect(
      decidePaidTransition(order("paid", "paypal", "CAP-1"), "CAP-1", "paypal"),
    ).toEqual({ action: "noop", reason: "already-paid" });
  });

  it("does not overwrite the reference when a different capture arrives for a paid order", () => {
    expect(
      decidePaidTransition(order("paid", "paypal", "CAP-1"), "CAP-2", "paypal"),
    ).toEqual({ action: "noop", reason: "already-paid" });
  });

  it("refuses to resurrect a failed or cancelled order", () => {
    expect(decidePaidTransition(order("failed"), "CAP-1", "paypal")).toEqual({
      action: "noop",
      reason: "not-pending",
    });
    expect(decidePaidTransition(order("cancelled"), "CAP-1", "paypal")).toEqual({
      action: "noop",
      reason: "not-pending",
    });
  });

  it("rejects an unknown order and a payment event with no reference", () => {
    expect(decidePaidTransition(null, "CAP-1", "paypal")).toEqual({
      action: "reject",
      reason: "unknown-order",
    });
    expect(decidePaidTransition(order("pending"), null, "paypal")).toEqual({
      action: "reject",
      reason: "missing-reference",
    });
  });

  it("promotes only on the first of two identical deliveries", () => {
    // First delivery sees a pending row.
    const first = decidePaidTransition(order("pending"), "CAP-9", "paypal");
    expect(first.action).toBe("promote");
    // The second sees the row the first one left behind.
    const second = decidePaidTransition(
      order("paid", "paypal", "CAP-9"),
      "CAP-9",
      "paypal",
    );
    expect(second.action).toBe("noop");
  });

  /**
   * Two processors, two public webhooks. An order belongs to whichever one
   * created it, and an event from the other must not be able to close it —
   * otherwise a forged or misrouted event on either endpoint settles an order
   * nobody paid for.
   */
  describe("provider scoping", () => {
    it("refuses to settle a PayPlus order with a PayPal capture", () => {
      expect(
        decidePaidTransition(order("pending", "payplus"), "CAP-1", "paypal"),
      ).toEqual({ action: "reject", reason: "provider-mismatch" });
    });

    it("refuses to settle a PayPal order with a PayPlus transaction", () => {
      expect(
        decidePaidTransition(order("pending", "paypal"), "TXN-1", "payplus"),
      ).toEqual({ action: "reject", reason: "provider-mismatch" });
    });

    it("rejects the mismatch rather than quietly no-opping it", () => {
      // A no-op would look like a handled duplicate in the logs. This has to
      // stay loud: it means something posted to the wrong endpoint.
      const paid = decidePaidTransition(
        order("paid", "payplus", "TXN-1"),
        "CAP-1",
        "paypal",
      );
      expect(paid).toEqual({ action: "reject", reason: "provider-mismatch" });
    });

    it("still promotes when the provider matches", () => {
      expect(
        decidePaidTransition(order("pending", "payplus"), "TXN-1", "payplus"),
      ).toEqual({ action: "promote", reference: "TXN-1" });
    });
  });

  /**
   * Cash on delivery is a MANUAL rail (owner decision 2026-10-23: plain cash,
   * no deposit). No webhook on any endpoint may move a `cash` order to paid —
   * these tests are the proof that a card event cannot reach one, whatever
   * status the row happens to be in, including `pending`, which a cash order
   * shares with a freshly-created card order.
   */
  describe("cash on delivery is out of reach of every callback", () => {
    for (const settling of SETTLEABLE_PROVIDERS) {
      for (const status of ["pending", "paid", "failed", "cancelled"] as OrderStatus[]) {
        it(`refuses a ${settling} settlement of a ${status} cash order`, () => {
          expect(
            decidePaidTransition(order(status, CASH_PROVIDER, null), "REF-1", settling),
          ).toEqual({ action: "reject", reason: "manual-provider" });
        });
      }
    }

    it("rejects rather than no-ops, so a misrouted event stays loud in the logs", () => {
      const decision = decidePaidTransition(
        order("pending", CASH_PROVIDER),
        "CAP-1",
        "paypal",
      );
      expect(decision.action).toBe("reject");
    });

    it("keeps cash out of the settleable set entirely", () => {
      expect(isSettleableProvider(CASH_PROVIDER)).toBe(false);
      expect(SETTLEABLE_PROVIDERS).toEqual(["paypal", "payplus"]);
      // …while still being a provider the application recognises on a row.
      expect(isPaymentProvider(CASH_PROVIDER)).toBe(true);
    });
  });
});

/**
 * The cash-on-delivery route's whole provider decision, extracted so it can
 * be asserted. The route contains no other provider or status literal, so
 * what is proved here is proved of the route: a cash-on-delivery checkout
 * cannot create a card-provider order.
 */
describe("cashOrderRow — what a cash-on-delivery checkout writes", () => {
  it("always writes the cash rail and the pending status", () => {
    const row = cashOrderRow();
    expect(row.payment_provider).toBe("cash");
    expect(row.status).toBe("pending");
  });

  it("can never produce a settleable provider", () => {
    expect(isSettleableProvider(cashOrderRow().payment_provider)).toBe(false);
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
