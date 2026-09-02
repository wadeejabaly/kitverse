import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayPlus wire protocol — the parts that are pure decisions.
 *
 * Split out of src/lib/payplus.ts on purpose. That module is `server-only`
 * (it holds the API keys); this one holds no secret, opens no socket and
 * decides nothing by network, so it can be unit-tested directly. Everything
 * here that needs a secret takes it as an argument.
 *
 * THE VERDICT RULE, because it is the whole reason this file exists:
 * PayPlus answers a declined card with HTTP 200 and an envelope that says
 * `results.status: "success"` — the "success" is about the API call, not the
 * money. The only thing that means a card was charged is
 * `status_code === "000"`, compared as a STRING (0, "0" and 0o0 are not it).
 */

/** The one status code that means money moved. String, always. */
export const PAYPLUS_APPROVED_STATUS_CODE = "000";

/** PayPlus identifies its own callbacks with this exact User-Agent. */
export const PAYPLUS_USER_AGENT = "PayPlus";

/** The only currency this store charges in. */
export const PAYPLUS_CURRENCY = "ILS";

/* ------------------------------------------------------------ signature -- */

/**
 * The `hash` header PayPlus puts on a callback: base64 of an HMAC-SHA256 of
 * the RAW request body, keyed with the account's secret key.
 *
 * Raw means raw. Parsing the body and re-serialising it changes whitespace,
 * key order and number formatting, and the signature is over bytes.
 */
export function signWebhookBody(rawBody: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(rawBody, "utf8").digest("base64");
}

export type WebhookAuthFailure =
  | "wrong-user-agent"
  | "missing-hash"
  | "bad-signature";

export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; reason: WebhookAuthFailure };

export interface WebhookAuthInput {
  userAgent: string | null;
  hashHeader: string | null;
  rawBody: string;
  secretKey: string;
}

/**
 * Authenticate a callback: the User-Agent AND the signature, both required.
 *
 * The User-Agent alone is worthless — anyone can send a header — and is
 * checked only because PayPlus documents it and a mismatch is a cheap, early
 * "this is not our processor". The signature is the actual proof.
 *
 * The comparison is timing-safe. A byte-by-byte early return leaks how much
 * of a forged signature was correct, which is enough to reconstruct one.
 */
export function verifyWebhookRequest(input: WebhookAuthInput): WebhookAuthResult {
  if (input.userAgent !== PAYPLUS_USER_AGENT) {
    return { ok: false, reason: "wrong-user-agent" };
  }
  if (!input.hashHeader) return { ok: false, reason: "missing-hash" };

  const expected = Buffer.from(signWebhookBody(input.rawBody, input.secretKey), "utf8");
  const received = Buffer.from(input.hashHeader, "utf8");

  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first. A length difference is not a secret — the digest length is fixed.
  if (expected.length !== received.length) return { ok: false, reason: "bad-signature" };
  if (!timingSafeEqual(expected, received)) return { ok: false, reason: "bad-signature" };

  return { ok: true };
}

/* --------------------------------------------------------------- reading -- */

/**
 * The facts a PayPlus payload can carry. Every field is nullable: this is
 * parsed from an unknown shape, and a missing field must read as "not stated"
 * rather than as a default that happens to be favourable.
 */
export interface PayPlusFacts {
  /** `more_info` — our own order uuid, round-tripped by PayPlus. */
  orderId: string | null;
  pageRequestUid: string | null;
  transactionUid: string | null;
  /** As REPORTED. Never a verdict on its own — see decidePayPlusVerdict. */
  statusCode: string | null;
  amount: number | null;
  currency: string | null;
}

const EMPTY_FACTS: PayPlusFacts = {
  orderId: null,
  pageRequestUid: null,
  transactionUid: null,
  statusCode: null,
  amount: null,
  currency: null,
};

type Bag = Record<string, unknown>;

function isBag(value: unknown): value is Bag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * PayPlus nests the same fields differently across endpoints and callback
 * types: sometimes at the top level, sometimes under `transaction`, sometimes
 * under the `data` envelope. Rather than guess one shape, look in all of them,
 * outermost first.
 */
function scopes(payload: unknown): Bag[] {
  if (!isBag(payload)) return [];
  const found: Bag[] = [payload];
  for (const key of ["transaction", "data", "results"]) {
    const child = payload[key];
    if (isBag(child)) {
      found.push(child);
      // One more level: `data.transaction` is a real shape on Transactions/View.
      for (const inner of ["transaction", "data"]) {
        const grandchild = child[inner];
        if (isBag(grandchild)) found.push(grandchild);
      }
    }
  }
  return found;
}

function pickString(payload: unknown, keys: string[]): string | null {
  for (const scope of scopes(payload)) {
    for (const key of keys) {
      const value = scope[key];
      if (typeof value === "string" && value !== "") return value;
      // Codes arrive as numbers on some endpoints. A numeric 0 is NOT "000";
      // it is stringified honestly here and rejected by the verdict below.
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
  }
  return null;
}

function pickNumber(payload: unknown, keys: string[]): number | null {
  for (const scope of scopes(payload)) {
    for (const key of keys) {
      const value = scope[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

/** Read whatever a callback or a lookup response is willing to tell us. */
export function readPayPlusFacts(payload: unknown): PayPlusFacts {
  if (!isBag(payload)) return { ...EMPTY_FACTS };
  return {
    orderId: pickString(payload, ["more_info", "more_info_1"]),
    pageRequestUid: pickString(payload, [
      "page_request_uid",
      "payment_request_uid",
    ]),
    transactionUid: pickString(payload, ["transaction_uid", "uid"]),
    // `status_code` only. `status` is the API-envelope word and says nothing
    // about the money — reading it here would smuggle it into the verdict.
    statusCode: pickString(payload, ["status_code"]),
    amount: pickNumber(payload, ["amount", "original_amount"]),
    currency: pickString(payload, ["currency_code", "currency"]),
  };
}

/* --------------------------------------------------------------- verdict -- */

export type PayPlusVerdictReason =
  | "no-facts"
  | "not-approved"
  | "amount-mismatch"
  | "currency-mismatch"
  | "missing-transaction-uid";

export type PayPlusVerdict =
  | { paid: true; transactionUid: string }
  | { paid: false; reason: PayPlusVerdictReason; detail: string };

/** Shekel amounts are compared to the agora. Anything looser is a discount. */
const AMOUNT_EPSILON = 0.005;

/**
 * Is this order paid, for this amount, in this currency?
 *
 * Called ONLY with facts fetched from PayPlus by us (PaymentPages/ipn or
 * Transactions/View) — never with the callback body, which is a claim rather
 * than a source. The callback tells us WHICH order to ask about; this decides
 * what actually happened.
 *
 * Four independent conditions, all required:
 *   - status_code is exactly the string "000";
 *   - the amount matches what our own repricing computed;
 *   - the currency matches;
 *   - there is a transaction uid to record against the order.
 */
export function decidePayPlusVerdict(
  facts: PayPlusFacts | null,
  expected: { amount: number; currency: string },
): PayPlusVerdict {
  if (!facts) {
    return { paid: false, reason: "no-facts", detail: "no PayPlus lookup result" };
  }

  if (facts.statusCode !== PAYPLUS_APPROVED_STATUS_CODE) {
    return {
      paid: false,
      reason: "not-approved",
      detail: `status_code was ${facts.statusCode === null ? "absent" : `"${facts.statusCode}"`}`,
    };
  }

  if (
    facts.currency === null ||
    facts.currency.toUpperCase() !== expected.currency.toUpperCase()
  ) {
    return {
      paid: false,
      reason: "currency-mismatch",
      detail: `expected ${expected.currency}, got ${facts.currency ?? "nothing"}`,
    };
  }

  if (facts.amount === null || Math.abs(facts.amount - expected.amount) > AMOUNT_EPSILON) {
    return {
      paid: false,
      reason: "amount-mismatch",
      detail: `expected ${expected.amount}, got ${facts.amount ?? "nothing"}`,
    };
  }

  if (!facts.transactionUid) {
    return {
      paid: false,
      reason: "missing-transaction-uid",
      detail: "approved payment carried no transaction uid",
    };
  }

  return { paid: true, transactionUid: facts.transactionUid };
}
