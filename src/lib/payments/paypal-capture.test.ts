import { describe, expect, it } from "vitest";
import { captureFacts, captureMatchesOrder } from "./paypal";

const capture = (over: Record<string, unknown> = {}) => ({ id: "CAP1", status: "COMPLETED", custom_id: "order-A", amount: { currency_code: "ILS", value: "290.00" }, ...over });

describe("a PayPal capture only settles its own order, in full", () => {
  it("accepts completed ILS money for exactly this order and total", () => {
    expect(captureMatchesOrder(captureFacts(capture()), "order-A", 29000)).toBe(true);
  });
  it("rejects another order's payment (the replay attack)", () => {
    expect(captureMatchesOrder(captureFacts(capture({ custom_id: "order-B" })), "order-A", 29000)).toBe(false);
  });
  it("rejects a different amount or currency", () => {
    expect(captureMatchesOrder(captureFacts(capture({ amount: { currency_code: "ILS", value: "95.00" } })), "order-A", 29000)).toBe(false);
    expect(captureMatchesOrder(captureFacts(capture({ amount: { currency_code: "USD", value: "290.00" } })), "order-A", 29000)).toBe(false);
  });
  it("doesn't count a capture that is still pending review", () => {
    expect(captureMatchesOrder(captureFacts(capture({ status: "PENDING" })), "order-A", 29000)).toBe(false);
  });
  it("reads agorot without float drift", () => {
    expect(captureFacts(capture({ amount: { currency_code: "ILS", value: "134.99" } })).amountAgorot).toBe(13499);
  });
});
