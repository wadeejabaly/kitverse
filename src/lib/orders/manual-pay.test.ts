import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fake-supabase";

/**
 * Whole personal-Bit / PayPal.Me flows against an in-memory database: the
 * order is never paid until the owner confirms, every duplicate path returns
 * the same order / refuses a second report, and a wrong amount is refused
 * unless the owner explicitly accepts it.
 */
let fake: FakeDb;
const notices: { kind: string; title: string }[] = [];
const claimedCodes: string[] = [];
let prepareCalls = 0;

vi.mock("../db", () => ({
  db: () => fake.client,
  must: <T,>(r: { data: T; error: { message: string } | null }, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  },
}));
vi.mock("../notify", () => ({ notify: async (n: { kind: string; title: string }) => { notices.push(n); } }));
vi.mock("../discounts", () => ({ recordDiscountCodeUse: async (c: string) => { claimedCodes.push(c); return true; } }));
vi.mock("./link", () => ({ orderToken: (id: string) => `${id}.sig` }));
vi.mock("./web", () => ({
  // stands in for the shared website-order writer: one priced order, status "quoted", unpaid
  prepareOrder: async () => {
    prepareCalls++;
    const order = { id: fake.id(), number: 1000 + prepareCalls, status: "quoted", payment_status: "unpaid", payment_method: null, total: 0, address: { full_name: "Test Buyer" }, source: "website", created_at: new Date().toISOString() };
    fake.t("orders").push(order);
    return { ok: true, order, q: { total: 30000 }, notAtSupplier: [] };
  },
}));

const mp = await import("./manual-pay");

const REQ = { items: [], customer: {}, locale: "ar" } as never;
const ATTEMPT = "11111111-1111-4111-8111-111111111111";
const order = (id: string) => fake.t("orders").find((o) => o.id === id)!;
const payment = (orderId: string) => fake.t("payments").find((p) => p.order_id === orderId)!;
const idOf = (token: string) => token.split(".")[0];

function setConfig(bit: Record<string, unknown> | null, pp: Record<string, unknown> | null) {
  fake.t("bot_settings").length = 0;
  if (bit) fake.t("bot_settings").push({ key: "bit_personal", value: bit });
  if (pp) fake.t("bot_settings").push({ key: "paypal_me", value: pp });
}

beforeEach(() => {
  fake = createFakeDb({ unique: { payments: [{ cols: ["provider", "provider_order_id"], where: (r) => r.provider === "bit_personal" || r.provider === "paypal_me" }] } });
  notices.length = 0;
  claimedCodes.length = 0;
  prepareCalls = 0;
  setConfig({ enabled: true, phone: "0501234567", name: "Wadi" }, { enabled: true, username: "kitverse" });
  delete process.env.BIT_PERSONAL_PHONE;
  delete process.env.PAYPAL_ME_USERNAME;
});

describe("configuration", () => {
  it("is off until the owner saves a valid number / name and turns it on", async () => {
    setConfig({ enabled: false, phone: "0501234567" }, { enabled: true, username: "bad name" });
    const cfg = await mp.getManualPayConfig();
    expect(cfg.bit.enabled).toBe(false);
    expect(cfg.paypalMe.enabled).toBe(false);
    expect(await mp.startManualOrder(REQ, "bit_personal", ATTEMPT)).toEqual({ ok: false, code: "payments_unconfigured" });
    expect(prepareCalls).toBe(0);
  });
  it("falls back to the environment only when the setting was never saved", async () => {
    setConfig(null, null);
    process.env.BIT_PERSONAL_PHONE = "+972 52 000 1111";
    const cfg = await mp.getManualPayConfig();
    expect(cfg.bit).toMatchObject({ enabled: true, phone: "0520001111" });
    expect(cfg.paypalMe.enabled).toBe(false);
  });
});

describe("checkout -> pay page", () => {
  it("writes ONE unpaid order per attempt, however many times it is submitted", async () => {
    const a = await mp.startManualOrder(REQ, "bit_personal", ATTEMPT);
    const b = await mp.startManualOrder(REQ, "bit_personal", ATTEMPT);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.token).toBe(a.token);
    expect(b.reused).toBe(true);
    expect(prepareCalls).toBe(1);
    const o = order(idOf(a.token));
    expect(o).toMatchObject({ payment_method: "bit_personal", payment_status: "unpaid", status: "quoted", total: 30000 });
    expect(fake.t("payments")).toHaveLength(1);
    expect(payment(o.id as string)).toMatchObject({ provider: "bit_personal", status: "pending", amount: 30000 });
  });

  it("a race that slips past the first check keeps the first order and cancels the duplicate", async () => {
    const [a, b] = await Promise.all([mp.startManualOrder(REQ, "paypal_me", ATTEMPT), mp.startManualOrder(REQ, "paypal_me", ATTEMPT)]);
    if (!a.ok || !b.ok) throw new Error("both should resolve to an order");
    expect(a.token).toBe(b.token);
    const live = fake.t("orders").filter((o) => o.status !== "cancelled");
    expect(live).toHaveLength(1);
    expect(fake.t("payments")).toHaveLength(1);
  });

  it("the pay page shows the exact amount, the payee and the order number for the note", async () => {
    const bit = await mp.startManualOrder(REQ, "bit_personal", ATTEMPT);
    const pp = await mp.startManualOrder(REQ, "paypal_me", "22222222-2222-4222-8222-222222222222");
    if (!bit.ok || !pp.ok) throw new Error("orders");
    const v1 = (await mp.manualPayView(idOf(bit.token)))!;
    expect(v1).toMatchObject({ method: "bit_personal", totalLabel: "300", note: `KV${bit.number}`, state: "awaiting_payment", bit: { phone: "0501234567", phoneLabel: "050-123-4567", name: "Wadi" }, paypal: null });
    const v2 = (await mp.manualPayView(idOf(pp.token)))!;
    expect(v2.paypal?.url).toBe("https://www.paypal.me/kitverse/300.00ILS");
  });
});

async function placed(method: "bit_personal" | "paypal_me" = "bit_personal") {
  const r = await mp.startManualOrder(REQ, method, crypto.randomUUID());
  if (!r.ok) throw new Error("order");
  return idOf(r.token);
}

describe("successful return: customer reports, owner confirms", () => {
  it("reporting a payment never marks the order paid", async () => {
    const id = await placed();
    expect(await mp.reportManualPayment(id, { reference: "BIT-778899" })).toEqual({ ok: true });
    expect(order(id)).toMatchObject({ status: "awaiting_payment_verification", payment_status: "unpaid" });
    expect(payment(id)).toMatchObject({ status: "pending", customer_reference: "BIT-778899" });
    expect(notices.at(-1)?.kind).toBe("order.payment_reported");
    expect((await mp.manualPayView(id))?.state).toBe("awaiting_verification");
  });

  it("a second report (double submit) is refused and its screenshot is not kept", async () => {
    const id = await placed();
    const img = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]), mime: "image/jpeg", ext: "jpg" };
    expect((await mp.reportManualPayment(id, { reference: "", proof: img })).ok).toBe(true);
    expect(await mp.reportManualPayment(id, { reference: "again", proof: img })).toEqual({ ok: false, code: "already_reported" });
    expect(Object.keys(fake.storage)).toHaveLength(1);
    expect(payment(id).customer_reference).toBeNull();
  });

  it("an empty report is refused", async () => {
    const id = await placed();
    expect(await mp.reportManualPayment(id, { reference: "" })).toEqual({ ok: false, code: "empty" });
  });

  it("the owner's confirmation with the exact amount is what makes it paid (once)", async () => {
    const id = await placed();
    await mp.reportManualPayment(id, { reference: "R1" });
    expect(await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 30000, acceptMismatch: false })).toEqual({ ok: true });
    expect(order(id)).toMatchObject({ payment_status: "paid", status: "awaiting_confirmation" });
    expect(payment(id)).toMatchObject({ status: "completed", received_amount: 30000 });
    expect((await mp.manualPayView(id))?.state).toBe("paid");
    // a double click / second admin does nothing
    expect(await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 30000, acceptMismatch: false })).toEqual({ ok: false, code: "not_pending" });
  });

  it("the owner can confirm a transfer the customer never reported", async () => {
    const id = await placed("paypal_me");
    expect((await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 30000, acceptMismatch: false })).ok).toBe(true);
    expect(order(id).payment_status).toBe("paid");
  });

  it("claims the order's discount codes only once paid", async () => {
    const id = await placed();
    fake.t("adjustments").push({ order_id: id, kind: "discount_code", discount_code: "WELCOME30" });
    await mp.reportManualPayment(id, { reference: "R1" });
    expect(claimedCodes).toEqual([]);
    await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 30000, acceptMismatch: false });
    expect(claimedCodes).toEqual(["WELCOME30"]);
  });
});

describe("incorrect amount", () => {
  it("is refused with the difference, and the order stays unpaid", async () => {
    const id = await placed();
    await mp.reportManualPayment(id, { reference: "R1" });
    expect(await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 27000, acceptMismatch: false })).toEqual({ ok: false, code: "amount_mismatch", kind: "short", differenceAgorot: 3000 });
    expect(order(id).payment_status).toBe("unpaid");
    expect(payment(id).status).toBe("pending");
  });
  it("is accepted only when the owner explicitly accepts it, and the shortfall is recorded", async () => {
    const id = await placed();
    expect((await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 27000, acceptMismatch: true })).ok).toBe(true);
    expect(payment(id)).toMatchObject({ status: "completed", received_amount: 27000 });
    expect(String(payment(id).review_note)).toContain("SHORT by ₪30");
  });
  it("rejects nonsense amounts", async () => {
    const id = await placed();
    expect(await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 0, acceptMismatch: true })).toEqual({ ok: false, code: "bad_amount" });
  });
});

describe("cancelled / failed payments", () => {
  it("the customer can cancel before paying; the payment is cancelled, never confirmable", async () => {
    const id = await placed();
    expect(await mp.cancelManualOrder(id)).toEqual({ ok: true });
    expect(order(id).status).toBe("cancelled");
    expect(payment(id).status).toBe("cancelled");
    expect((await mp.manualPayView(id))?.state).toBe("cancelled");
    expect(await mp.verifyManualPayment({ orderId: id, staffId: null, receivedAgorot: 30000, acceptMismatch: false })).toEqual({ ok: false, code: "order_cancelled" });
  });
  it("the customer cannot cancel once they reported paying", async () => {
    const id = await placed();
    await mp.reportManualPayment(id, { reference: "R1" });
    expect(await mp.cancelManualOrder(id)).toEqual({ ok: false });
    expect(order(id).status).toBe("awaiting_payment_verification");
  });
  it("owner 'can't find it yet' sends it back to the customer to check and resubmit", async () => {
    const id = await placed();
    await mp.reportManualPayment(id, { reference: "R1" });
    expect(await mp.rejectManualPayment({ orderId: id, staffId: null, mode: "retry", note: "Wrong number?" })).toEqual({ ok: true });
    expect(order(id)).toMatchObject({ status: "quoted", payment_status: "unpaid" });
    const v = (await mp.manualPayView(id))!;
    expect(v.state).toBe("needs_resubmit");
    expect(v.reviewNote).toBe("Wrong number?");
    expect((await mp.reportManualPayment(id, { reference: "R2" })).ok).toBe(true); // can report again
    expect((await mp.manualPayView(id))?.state).toBe("awaiting_verification");
  });
  it("owner 'not received' fails the payment and cancels the order", async () => {
    const id = await placed();
    await mp.reportManualPayment(id, { reference: "R1" });
    expect(await mp.rejectManualPayment({ orderId: id, staffId: null, mode: "cancel" })).toEqual({ ok: true });
    expect(order(id)).toMatchObject({ status: "cancelled", payment_status: "unpaid" });
    expect(payment(id).status).toBe("failed");
    expect((await mp.manualPayView(id))?.state).toBe("failed");
    expect((await mp.reportManualPayment(id, { reference: "R3" })).ok).toBe(false);
  });
});
