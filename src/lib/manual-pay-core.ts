/**
 * Pure helpers for the two "pay by hand, the owner verifies" methods (owner
 * requests 2026-11-10): a transfer to the owner's PERSONAL Bit account, and a
 * payment through the owner's personal PayPal.Me link. No I/O here, so it is
 * unit-tested directly (manual-pay-core.test.ts) and safe to import from the
 * browser.
 *
 * What these rails can and cannot do (checked 2026-11-10):
 *  - PayPal.Me: `paypal.me/<user>/<amount><CURRENCY>` pre-fills the amount and
 *    currency (PayPal help HELP432). There is NO supported parameter for a note,
 *    an order reference or a return URL, so the customer is asked to type the
 *    order number into PayPal's note themselves and comes back to our tab.
 *  - Personal Bit: there is no public deep link that opens Bit with a payee and
 *    amount filled in - payment links/QR codes exist only through Bit's
 *    business API / licensed PSPs, which the owner ruled out. So the customer
 *    copies the number and amount from our page.
 *  - Neither rail tells the website that money arrived. An order on either is
 *    paid ONLY when the owner confirms it in admin (src/lib/orders/manual-pay.ts).
 */

export const MANUAL_METHODS = ["bit_personal", "paypal_me"] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];

export const isManualMethod = (v: unknown): v is ManualMethod => v === "bit_personal" || v === "paypal_me";

/** Israeli mobile number (what Bit is registered on) -> "05XXXXXXXX", or null. Accepts +972 / 972 / spaces / dashes. */
export function normalizeBitPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/[\s\-().]/g, "");
  if (d.startsWith("+972")) d = "0" + d.slice(4);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  return /^05\d{8}$/.test(d) ? d : null;
}

/** "0501234567" -> "050-123-4567" (how Israelis read and type a number). */
export const formatBitPhone = (phone: string) => `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;

/** PayPal.Me usernames are letters and digits, at most 20 characters. Accepts a pasted link too. */
export function normalizePayPalMeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?paypal\.me\//i, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9]{1,20}$/.test(s) ? s : null;
}

/** The PayPal.Me link with the exact amount in ILS pre-filled (the only parameters PayPal.Me supports). */
export function paypalMeUrl(username: string, totalAgorot: number): string {
  if (!Number.isInteger(totalAgorot) || totalAgorot <= 0) throw new Error("paypalMeUrl: amount must be a positive whole number of agorot");
  return `https://www.paypal.me/${encodeURIComponent(username)}/${(totalAgorot / 100).toFixed(2)}ILS`;
}

/** What the customer types into the Bit / PayPal note so the owner can match the transfer: "KV1042". */
export const transferNote = (orderNumber: number) => `KV${orderNumber}`;

/** Agorot -> "123.50" / "300" for display (no currency sign). */
export const formatIls = (agorot: number) => (agorot % 100 === 0 ? String(agorot / 100) : (agorot / 100).toFixed(2));

/** Parse an amount the owner typed ("300", "299.9", "₪300", "1,200") into agorot, or null. */
export function parseIlsToAgorot(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[₪,\s]/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** The customer's free-text payment reference: trimmed, single-line, at most 80 chars, no control characters. */
export function cleanReference(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * What an uploaded screenshot really is, from its first bytes (never from the
 * file name or the browser's claimed type). Only real image formats pass.
 */
export function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  const b = (i: number) => bytes[i];
  if (bytes.length < 12) return null;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return { mime: "image/png", ext: "png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "heim", "heis"].includes(brand)) return { mime: "image/heic", ext: "heic" };
    if (["mif1", "msf1"].includes(brand)) return { mime: "image/heif", ext: "heif" };
  }
  return null;
}

/**
 * The one customer-facing view of where a manual payment stands. Derived only
 * from what the database says - never from the customer having come back
 * from PayPal or Bit.
 */
export type ManualPayState = "awaiting_payment" | "awaiting_verification" | "needs_resubmit" | "paid" | "failed" | "cancelled";

export function manualPayState(o: {
  orderStatus: string;
  paymentStatus: string;
  payment: { status: string; reportedAt: string | null; reviewNote: string | null } | null;
}): ManualPayState {
  if (o.paymentStatus === "paid" || o.payment?.status === "completed") return "paid";
  if (o.payment?.status === "failed") return "failed";
  if (o.orderStatus === "cancelled" || o.payment?.status === "cancelled") return "cancelled";
  if (o.payment?.reportedAt) return "awaiting_verification";
  if (o.payment?.reviewNote) return "needs_resubmit";
  return "awaiting_payment";
}

/** Owner check: does what arrived match the order total exactly? */
export type AmountCheck = { ok: true } | { ok: false; kind: "short" | "over"; differenceAgorot: number };
export function checkReceivedAmount(expectedAgorot: number, receivedAgorot: number): AmountCheck {
  if (receivedAgorot === expectedAgorot) return { ok: true };
  return receivedAgorot < expectedAgorot
    ? { ok: false, kind: "short", differenceAgorot: expectedAgorot - receivedAgorot }
    : { ok: false, kind: "over", differenceAgorot: receivedAgorot - expectedAgorot };
}
