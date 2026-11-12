import { describe, it, expect } from "vitest";
import { orderProfit, parseCosts, missingCosts, shekelsToAgorot, type OrderForProfit } from "./costs";

const costs = parseCosts({
  shirtFan: 4000, shirtPlayer: 5000, shirtRetro: 6000, longSleeveExtra: 500, nameNumber: 800, patch: 300, giftBox: 1000, scarf: 2000, keychain: 500,
  supplierShippingPerShirt: 700, deliveryPerOrder: 2500, fees: { paypal_me: { pct: 3.4, fixed: 120 } },
});
const order = (o: Partial<OrderForProfit>): OrderForProfit => ({ id: "x", number: 1, total: 0, subtotal: 0, delivery_fee: 0, discount_total: 0, payment_method: "cod", gift_boxes: 0, items: [], accessories: [], ...o });

describe("net profit per order (owner request 2026-11-13)", () => {
  it("adds every cost the owner entered", () => {
    const p = orderProfit(order({
      total: 40000,
      items: [
        { qty: 2, version: "player", sleeve: "long", retro: false, print: true, patches: 2, box: false }, // 2 x (50+5) + 2 x (8 + 2x3)
        { qty: 1, version: "fan", sleeve: "short", retro: true, print: false, patches: 0, box: true },     // retro 60 + box 10
      ],
      accessories: [{ category: "scarf", qty: 1 }],
      gift_boxes: 1,
    }), costs);
    expect(p.shirts).toBe(3);
    expect(p.productCost).toBe(2 * 5500 + 6000);
    expect(p.customisationCost).toBe(2 * (800 + 600));
    expect(p.extrasCost).toBe(1000 + 1000 + 2000);
    expect(p.supplierShipping).toBe(3 * 700);
    expect(p.delivery).toBe(2500);
    expect(p.paymentFee).toBe(0);
    expect(p.profit).toBe(40000 - p.totalCost);
  });
  it("payment fee = percent of the total + fixed", () => {
    expect(orderProfit(order({ total: 30000, payment_method: "paypal_me" }), costs).paymentFee).toBe(1020 + 120);
  });
  it("empty costs are flagged, bad values are 0", () => {
    expect(missingCosts(parseCosts({}))).toContain("fan shirt");
    expect(parseCosts({ shirtFan: -5, fees: { cod: { pct: 500 } } }).shirtFan).toBe(0);
    expect(parseCosts({ fees: { cod: { pct: 500 } } }).fees.cod.pct).toBe(100);
  });
  it("reads shekel amounts", () => {
    expect(shekelsToAgorot("45")).toBe(4500);
    expect(shekelsToAgorot("₪ 45,50")).toBe(4550);
    expect(shekelsToAgorot("")).toBe(0);
    expect(shekelsToAgorot("abc")).toBeNull();
  });
});
