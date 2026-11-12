import { describe, it, expect } from "vitest";
import { orderProfit, parseCosts, missingCosts, shekelsToAgorot, type OrderForProfit } from "./costs";

// the owner's real sheet (2026-11-13): supplier prices in US dollars, courier 40 north / 65 elsewhere
const costs = parseCosts({
  supplierCurrency: "USD", usdRate: 3.2,
  shirtFan: 900, shirtPlayer: 1200, shirtRetro: 1200, longSleeveExtra: 200, bigSizeExtra: 100, kidsSet: 1000, adultSet: 1300, nameNumber: 150, patch: 100,
  deliveryNorth: 4000, deliveryOther: 6500, giftBox: 1000, fees: { paypal_me: { pct: 3.4, fixed: 120 } },
});
const order = (o: Partial<OrderForProfit>): OrderForProfit => ({ id: "x", number: 1, total: 0, subtotal: 0, delivery_fee: 0, discount_total: 0, payment_method: "cod", gift_boxes: 0, zone: "north", items: [], accessories: [], ...o });
const it1 = { qty: 1, version: "fan", sleeve: "short", retro: false, print: false, patches: 0, box: false };

describe("net profit per order (owner request 2026-11-13)", () => {
  it("converts dollar supplier prices and adds every cost", () => {
    const p = orderProfit(order({
      total: 40000,
      items: [
        { qty: 2, version: "player", sleeve: "long", retro: false, print: true, patches: 2, box: false, size: "3XL" }, // 2 x $(12+2+1) + 2 x $(1.5+2)
        { qty: 1, version: "fan", sleeve: "short", retro: true, print: false, patches: 0, box: true },               // retro $12 + box ₪10
      ],
      gift_boxes: 1,
    }), costs);
    expect(p.shirts).toBe(3);
    expect(p.productCost).toBe(2 * Math.round(1500 * 3.2) + Math.round(1200 * 3.2));
    expect(p.customisationCost).toBe(2 * Math.round(350 * 3.2));
    expect(p.extrasCost).toBe(1000 + 1000);
    expect(p.delivery).toBe(4000);
    expect(p.profit).toBe(40000 - p.totalCost);
  });
  it("north vs the rest of Israel, kids and adult sets", () => {
    expect(orderProfit(order({ zone: "center" }), costs).delivery).toBe(6500);
    expect(orderProfit(order({ items: [{ ...it1, audience: "kids" }] }), costs).productCost).toBe(3200);
    expect(orderProfit(order({ items: [{ ...it1, set: true }] }), costs).productCost).toBe(Math.round(1300 * 3.2));
  });
  it("payment fee = percent of the total + fixed", () => {
    expect(orderProfit(order({ total: 30000, payment_method: "paypal_me" }), costs).paymentFee).toBe(1020 + 120);
  });
  it("empty costs are flagged, bad values are 0, the old single delivery cost still reads", () => {
    expect(missingCosts(parseCosts({}))).toContain("fan shirt");
    expect(missingCosts(parseCosts({ supplierCurrency: "USD" }))).toContain("dollar rate");
    expect(parseCosts({ shirtFan: -5 }).shirtFan).toBe(0);
    expect(parseCosts({ fees: { cod: { pct: 500 } } }).fees.cod.pct).toBe(100);
    expect(parseCosts({ deliveryPerOrder: 3000 }).deliveryOther).toBe(3000);
  });
  it("reads amounts", () => {
    expect(shekelsToAgorot("45")).toBe(4500);
    expect(shekelsToAgorot("₪ 45,50")).toBe(4550);
    expect(shekelsToAgorot("")).toBe(0);
    expect(shekelsToAgorot("abc")).toBeNull();
  });
});
