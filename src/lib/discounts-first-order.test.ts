import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// A tiny stand-in for the Supabase query builder: customers by phone, then
// orders for those customers that are past draft and not cancelled.
type Order = { customer_id: string; status: string };
let customers: { id: string; phone: string }[] = [];
let orders: Order[] = [];
let lastStatusFilter = "";

vi.mock("./db", () => ({
  db: () => ({
    from: (table: string) => {
      if (table === "customers") {
        return { select: () => ({ eq: (_c: string, phone: string) => Promise.resolve({ data: customers.filter((c) => c.phone === phone) }) }) };
      }
      return {
        select: () => ({
          in: (_c: string, ids: string[]) => ({
            not: (_col: string, _op: string, list: string) => {
              lastStatusFilter = list;
              const excluded = list.replace(/[()]/g, "").split(",");
              return {
                limit: () => Promise.resolve({ data: orders.filter((o) => ids.includes(o.customer_id) && !excluded.includes(o.status)), error: null }),
              };
            },
          }),
        }),
      };
    },
  }),
}));

const { hasEarlierOrder } = await import("./discounts");

beforeEach(() => {
  customers = [{ id: "c1", phone: "+972501234567" }];
  orders = [];
});

describe("hasEarlierOrder (first-order-only codes)", () => {
  it("is false for a phone we have never seen", async () => {
    expect(await hasEarlierOrder("+972509999999")).toBe(false);
  });
  it("is false when the only orders are drafts (unpaid PayPal/Bit attempts) or cancelled", async () => {
    orders = [{ customer_id: "c1", status: "draft" }, { customer_id: "c1", status: "cancelled" }];
    expect(await hasEarlierOrder("+972501234567")).toBe(false);
    expect(lastStatusFilter).toBe("(draft,quoted,cancelled)");
  });
  it("ignores an unpaid online / Bit / PayPal.Me checkout that never went anywhere (quoted)", async () => {
    orders = [{ customer_id: "c1", status: "quoted" }];
    expect(await hasEarlierOrder("+972501234567")).toBe(false);
  });
  it("counts an order whose payment the customer reported (awaiting verification)", async () => {
    orders = [{ customer_id: "c1", status: "awaiting_payment_verification" }];
    expect(await hasEarlierOrder("+972501234567")).toBe(true);
  });
  it("is true once the phone has a real order", async () => {
    orders = [{ customer_id: "c1", status: "awaiting_confirmation" }];
    expect(await hasEarlierOrder("+972501234567")).toBe(true);
  });
});
