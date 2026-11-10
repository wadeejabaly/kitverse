import { describe, expect, it } from "vitest";
import {
  checkReceivedAmount, cleanReference, formatBitPhone, formatIls, manualPayState, normalizeBitPhone,
  normalizePayPalMeUsername, parseIlsToAgorot, paypalMeUrl, sniffImage, transferNote,
} from "./manual-pay-core";

describe("Bit phone", () => {
  it("accepts Israeli mobiles in every common spelling", () => {
    for (const raw of ["0501234567", "050-123-4567", "+972 50 123 4567", "972501234567", "(050) 123-4567"]) expect(normalizeBitPhone(raw)).toBe("0501234567");
  });
  it("refuses landlines, short numbers and junk", () => {
    for (const raw of ["04-1234567", "05012345", "hello", "", undefined, 501234567]) expect(normalizeBitPhone(raw)).toBeNull();
  });
  it("formats for display", () => expect(formatBitPhone("0501234567")).toBe("050-123-4567"));
});

describe("PayPal.Me", () => {
  it("takes a bare name or a pasted link", () => {
    expect(normalizePayPalMeUsername("kitverse")).toBe("kitverse");
    expect(normalizePayPalMeUsername("https://www.paypal.me/KitVerse/50")).toBe("KitVerse");
    expect(normalizePayPalMeUsername("paypal.me/kitverse?locale=he")).toBe("kitverse");
  });
  it("refuses names PayPal.Me can't have", () => {
    for (const raw of ["kit verse", "kit-verse", "a".repeat(21), "", "<script>"]) expect(normalizePayPalMeUsername(raw)).toBeNull();
  });
  it("pre-fills the exact amount in ILS, the only parameters PayPal.Me supports", () => {
    expect(paypalMeUrl("kitverse", 30000)).toBe("https://www.paypal.me/kitverse/300.00ILS");
    expect(paypalMeUrl("kitverse", 29990)).toBe("https://www.paypal.me/kitverse/299.90ILS");
  });
  it("never builds a link for a zero, negative or fractional-agorot amount", () => {
    expect(() => paypalMeUrl("kitverse", 0)).toThrow();
    expect(() => paypalMeUrl("kitverse", -100)).toThrow();
    expect(() => paypalMeUrl("kitverse", 100.5)).toThrow();
  });
});

describe("amounts and references", () => {
  it("formats ILS", () => {
    expect(formatIls(30000)).toBe("300");
    expect(formatIls(29990)).toBe("299.90");
  });
  it("parses what the owner types", () => {
    expect(parseIlsToAgorot("300")).toBe(30000);
    expect(parseIlsToAgorot("₪299.9")).toBe(29990);
    expect(parseIlsToAgorot("1,200")).toBe(120000);
    expect(parseIlsToAgorot("abc")).toBeNull();
    expect(parseIlsToAgorot("-5")).toBeNull();
  });
  it("the note is the order number", () => expect(transferNote(1042)).toBe("KV1042"));
  it("cleans a customer reference", () => {
    expect(cleanReference("  AB12\n34\t ")).toBe("AB12 34");
    expect(cleanReference("x".repeat(200))).toHaveLength(80);
    expect(cleanReference(undefined)).toBe("");
  });
  it("flags a wrong amount, short or over", () => {
    expect(checkReceivedAmount(30000, 30000)).toEqual({ ok: true });
    expect(checkReceivedAmount(30000, 27000)).toEqual({ ok: false, kind: "short", differenceAgorot: 3000 });
    expect(checkReceivedAmount(30000, 30100)).toEqual({ ok: false, kind: "over", differenceAgorot: 100 });
  });
});

describe("screenshot sniffing", () => {
  const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);
  it("recognises real image headers", () => {
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))?.mime).toBe("image/png");
    expect(sniffImage(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]))?.mime).toBe("image/webp");
    expect(sniffImage(new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0]))?.mime).toBe("image/heic");
  });
  it("refuses anything else, whatever its name", () => {
    expect(sniffImage(new Uint8Array(Buffer.from("%PDF-1.7 hello world")))).toBeNull();
    expect(sniffImage(new Uint8Array(Buffer.from("<svg xmlns=...></svg>")))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("payment state shown to the customer", () => {
  const base = { orderStatus: "quoted", paymentStatus: "unpaid", payment: { status: "pending", reportedAt: null, reviewNote: null } };
  it("is never 'paid' just because the customer reported paying", () => {
    expect(manualPayState({ ...base, payment: { ...base.payment, reportedAt: "2026-11-10T10:00:00Z" } })).toBe("awaiting_verification");
  });
  it("covers every state", () => {
    expect(manualPayState(base)).toBe("awaiting_payment");
    expect(manualPayState({ ...base, payment: { ...base.payment, reviewNote: "not found" } })).toBe("needs_resubmit");
    expect(manualPayState({ ...base, paymentStatus: "paid", payment: { ...base.payment, status: "completed" } })).toBe("paid");
    expect(manualPayState({ ...base, orderStatus: "cancelled", payment: { ...base.payment, status: "failed" } })).toBe("failed");
    expect(manualPayState({ ...base, orderStatus: "cancelled", payment: { ...base.payment, status: "cancelled" } })).toBe("cancelled");
  });
});
