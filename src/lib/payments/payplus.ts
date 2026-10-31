import "server-only";
import { env } from "../env";
import { PAYPLUS_CURRENCY, readPayPlusFacts, type PayPlusFacts } from "./payplus-protocol";

/**
 * PayPlus REST — SERVER ONLY.
 *
 * PayPlus is the PSP this store uses for Bit (owner decision 2026-10-31,
 * Part 7 — "Bit (Israeli PSP, likely PayPlus)"). `import "server-only"` is
 * the guard that keeps PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY out of any
 * browser bundle. There is NO public PayPlus value: the browser never calls
 * PayPlus, and the only thing the client receives is a redirect URL this
 * server asked PayPlus to mint.
 *
 * Every call returns a discriminated result instead of throwing — on the
 * money path a caller must be made to look at the failure.
 *
 * PAYPLUS_ENV decides where real money moves. It defaults to sandbox — the
 * safe direction — and only the exact string "live" switches it over.
 *
 * Owner decision 2026-10-31: rebuilt from the project's own earlier PayPlus
 * module (git history, commit 7d8fea9) after the old shop backend it
 * belonged to was retired — same protocol, retargeted at the current
 * `payments` table (supabase/migrations/20260930120000_core_schema.sql)
 * instead of the old flat orders columns.
 */

const API_BASE = {
  sandbox: "https://restapidev.payplus.co.il/api/v1.0",
  live: "https://restapi.payplus.co.il/api/v1.0",
} as const;

export type PayPlusEnv = keyof typeof API_BASE;

/** sandbox unless PAYPLUS_ENV is exactly "live" — never guess towards live. */
export function getPayPlusEnv(): PayPlusEnv {
  return env().PAYPLUS_ENV === "live" ? "live" : "sandbox";
}

function apiBase(): string {
  return API_BASE[getPayPlusEnv()];
}

export type PayPlusErrorCode = "unconfigured" | "network" | "api_error" | "invalid_response";
export type PayPlusResult<T> = { ok: true; value: T } | { ok: false; code: PayPlusErrorCode; detail: string };

function fail<T>(code: PayPlusErrorCode, detail: string): PayPlusResult<T> {
  return { ok: false, code, detail };
}

interface PayPlusCredentials {
  apiKey: string;
  secretKey: string;
  paymentPageUid: string;
}

function credentials(): PayPlusCredentials | null {
  const { PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY, PAYPLUS_PAYMENT_PAGE_UID } = env();
  if (!PAYPLUS_API_KEY || !PAYPLUS_SECRET_KEY || !PAYPLUS_PAYMENT_PAGE_UID) return null;
  return { apiKey: PAYPLUS_API_KEY, secretKey: PAYPLUS_SECRET_KEY, paymentPageUid: PAYPLUS_PAYMENT_PAGE_UID };
}

/** True when all three PayPlus variables are set. Checked before checkout offers Bit at all. */
export function isPayPlusConfigured(): boolean {
  return credentials() !== null;
}

/** The HMAC key used to authenticate callbacks. Never sent anywhere; returned only so the pure protocol module can verify with it. */
export function getPayPlusSecretKey(): string | null {
  return credentials()?.secretKey ?? null;
}

/* ---------------------------------------------------------------- calls -- */

/**
 * One POST to PayPlus. The response body is read as TEXT first and only
 * then parsed — PayPlus answers a rejected request with HTTP 422 and a
 * PLAIN-TEXT body; assuming JSON there throws inside the parser and loses
 * the one thing that says what was wrong.
 */
async function post(path: string, body: Record<string, unknown>): Promise<PayPlusResult<Record<string, unknown>>> {
  const creds = credentials();
  if (!creds) return fail("unconfigured", "PayPlus credentials are not set");

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": creds.apiKey, "secret-key": creds.secretKey },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    return fail("network", describe(error));
  }
  return readBody(response, path);
}

async function readBody(response: Response, path: string): Promise<PayPlusResult<Record<string, unknown>>> {
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const detail = text.trim().slice(0, 500) || "no body";
    return fail("api_error", `${path} returned ${response.status}: ${detail}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("invalid_response", `${path} returned a non-JSON body`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail("invalid_response", `${path} returned a non-object body`);
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/** The `data` envelope PayPlus wraps successful payloads in. */
function envelope(payload: Record<string, unknown>): Record<string, unknown> | null {
  const data = payload.data;
  return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

/* -------------------------------------------------------- generate link -- */

export interface PayPlusLineItem {
  name: string;
  quantity: number;
  /** Unit price in shekels, decimal — PayPlus is not an agorot API. */
  price: number;
}

export interface PayPlusLinkRequest {
  /** Our own order uuid. Goes out as more_info and comes back on callbacks. */
  orderId: string;
  /** The total this server computed, in agorot — converted to decimal shekels at this boundary only. */
  amountAgorot: number;
  customerName: string;
  customerEmail: string;
  items: PayPlusLineItem[];
  successUrl: string;
  failureUrl: string;
  cancelUrl: string;
  callbackUrl: string;
}

export interface PayPlusLink {
  pageRequestUid: string;
  paymentPageLink: string;
}

/**
 * Mint a hosted payment page for an amount this server computed. `more_info`
 * carries our order uuid so a callback arriving later — possibly after the
 * buyer closed the tab — resolves back to the right row without trusting
 * anything in the URL the browser was sent to.
 *
 * charge_method 1 is a direct charge (not a J2 authorisation): the money is
 * taken on approval, which is what a store selling a physical shirt wants.
 * Whichever charge methods (cards, Bit, …) are enabled for this payment page
 * uid on the real PayPlus account is what the hosted page actually offers —
 * this call does not and cannot restrict it to Bit alone.
 */
export async function generatePaymentLink(request: PayPlusLinkRequest): Promise<PayPlusResult<PayPlusLink>> {
  const amount = round2(request.amountAgorot / 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("api_error", "refusing to create a payment page for a non-positive total");
  }
  const creds = credentials();
  if (!creds) return fail("unconfigured", "PayPlus credentials are not set");

  const result = await post("PaymentPages/generateLink", {
    payment_page_uid: creds.paymentPageUid,
    charge_method: 1,
    amount,
    currency_code: PAYPLUS_CURRENCY,
    sendEmailApproval: false,
    sendEmailFailure: false,
    initial_invoice: false,
    send_failure_callback: true,
    more_info: request.orderId,
    refURL_success: request.successUrl,
    refURL_failure: request.failureUrl,
    refURL_cancel: request.cancelUrl,
    refURL_callback: request.callbackUrl,
    customer: { customer_name: request.customerName, email: request.customerEmail },
    items: request.items.map((item) => ({ name: item.name, quantity: item.quantity, price: round2(item.price) })),
  });
  if (!result.ok) return result;

  const data = envelope(result.value);
  const pageRequestUid = data?.page_request_uid;
  const paymentPageLink = data?.payment_page_link;
  if (typeof pageRequestUid !== "string" || pageRequestUid === "") return fail("invalid_response", "generateLink returned no page_request_uid");
  if (typeof paymentPageLink !== "string" || paymentPageLink === "") return fail("invalid_response", "generateLink returned no payment_page_link");

  return { ok: true, value: { pageRequestUid, paymentPageLink } };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------ verify a payment -- */

/** Ask PayPlus what happened, rather than believing what a callback claims. PaymentPages/ipn is keyed by the page request uid we stored when the page was minted. */
export async function fetchPaymentPageStatus(pageRequestUid: string): Promise<PayPlusResult<PayPlusFacts>> {
  const result = await post("PaymentPages/ipn", { page_request_uid: pageRequestUid });
  if (!result.ok) return result;
  return { ok: true, value: readPayPlusFacts(result.value) };
}

/** Transactions/View — keyed by the transaction uid a callback named. */
export async function fetchTransaction(transactionUid: string): Promise<PayPlusResult<PayPlusFacts>> {
  const result = await post("Transactions/View", { transaction_uid: transactionUid });
  if (!result.ok) return result;
  return { ok: true, value: readPayPlusFacts(result.value) };
}

/**
 * The facts for one payment attempt, from whichever lookup can answer. The
 * page lookup is tried first (the page request uid is ours, always on the
 * order's payments row); if it comes back without a status code the
 * transaction lookup is tried with the uid the callback named. Neither
 * answering is a verification failure, not a decline.
 */
export async function fetchPaymentFacts(options: {
  pageRequestUid: string | null;
  transactionUid: string | null;
}): Promise<PayPlusResult<PayPlusFacts>> {
  let lastError: PayPlusResult<PayPlusFacts> | null = null;

  if (options.pageRequestUid) {
    const byPage = await fetchPaymentPageStatus(options.pageRequestUid);
    if (byPage.ok && byPage.value.statusCode !== null) return byPage;
    if (!byPage.ok) lastError = byPage;
  }
  if (options.transactionUid) {
    const byTransaction = await fetchTransaction(options.transactionUid);
    if (byTransaction.ok && byTransaction.value.statusCode !== null) return byTransaction;
    if (!byTransaction.ok) lastError = byTransaction;
  }
  return lastError ?? fail("invalid_response", "no PayPlus lookup returned a status_code");
}

/* ---------------------------------------------------------------- refund -- */

export interface PayPlusRefund {
  statusCode: string | null;
  transactionUid: string | null;
}

/**
 * Refund a settled transaction, in full or in part. Server helper only —
 * there is no refund UI; refunds are issued from the PayPlus dashboard or by
 * calling this from a script.
 */
export async function refundTransaction(transactionUid: string, amountAgorot: number): Promise<PayPlusResult<PayPlusRefund>> {
  const amount = round2(amountAgorot / 100);
  if (!Number.isFinite(amount) || amount <= 0) return fail("api_error", "refusing to refund a non-positive amount");

  const result = await post("Transactions/RefundByTransactionUID", { transaction_uid: transactionUid, amount });
  if (!result.ok) return result;

  const facts = readPayPlusFacts(result.value);
  return { ok: true, value: { statusCode: facts.statusCode, transactionUid: facts.transactionUid } };
}
