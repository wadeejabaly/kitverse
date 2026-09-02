import "server-only";
import {
  PAYPLUS_CURRENCY,
  readPayPlusFacts,
  type PayPlusFacts,
} from "@/lib/payplus-protocol";

/**
 * PayPlus REST — SERVER ONLY.
 *
 * PayPlus is the primary processor: Israeli-issued cards clear here. PayPal
 * remains the international option, and the two never touch the same order
 * (see `payment_provider` in supabase/migrations/0002_payplus.sql).
 *
 * `import "server-only"` on line 1 is the enforcement that keeps
 * PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY out of any browser bundle. There is NO
 * public PayPlus value: unlike PayPal, nothing here is ever NEXT_PUBLIC_, the
 * browser never calls PayPlus, and the only thing the client receives is a
 * redirect URL this server asked PayPlus to mint.
 *
 * Like the PayPal module, every call returns a discriminated result instead of
 * throwing. On the money path a caller must be made to look at the failure.
 *
 * PAYPLUS_ENV decides where real money moves. It defaults to sandbox — the
 * safe direction — and only the exact string "live" switches it over.
 */

// The provider's fixed API hosts. These belong to PayPlus, not to this site,
// so they cannot derive from getSiteUrl(); scripts/preflight.mjs allows
// exactly these two hosts in exactly this file.
const API_BASE = {
  sandbox: "https://restapidev.payplus.co.il/api/v1.0",
  live: "https://restapi.payplus.co.il/api/v1.0",
} as const;

export type PayPlusEnv = keyof typeof API_BASE;

/** sandbox unless PAYPLUS_ENV is exactly "live" — never guess towards live. */
export function getPayPlusEnv(): PayPlusEnv {
  return process.env.PAYPLUS_ENV === "live" ? "live" : "sandbox";
}

function apiBase(): string {
  return API_BASE[getPayPlusEnv()];
}

export type PayPlusErrorCode =
  | "unconfigured"
  | "network"
  | "api_error"
  | "invalid_response";

export type PayPlusResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: PayPlusErrorCode; detail: string };

function fail<T>(code: PayPlusErrorCode, detail: string): PayPlusResult<T> {
  return { ok: false, code, detail };
}

/* ------------------------------------------------------------------ env -- */

interface PayPlusCredentials {
  apiKey: string;
  secretKey: string;
  paymentPageUid: string;
}

function credentials(): PayPlusCredentials | null {
  const apiKey = process.env.PAYPLUS_API_KEY;
  const secretKey = process.env.PAYPLUS_SECRET_KEY;
  const paymentPageUid = process.env.PAYPLUS_PAYMENT_PAGE_UID;
  if (!apiKey || !secretKey || !paymentPageUid) return null;
  return { apiKey, secretKey, paymentPageUid };
}

/**
 * True when all three PayPlus variables are present. Missing env is a
 * first-class state, not an error: the store must build and run with no
 * environment at all, and checkout simply does not offer the card method.
 */
export function isPayPlusConfigured(): boolean {
  return credentials() !== null;
}

/**
 * The secret used to authenticate callbacks. Returned rather than used here
 * so the verification itself stays in the pure, testable protocol module.
 * Never send this value anywhere; it is an HMAC key, not a bearer token.
 */
export function getPayPlusSecretKey(): string | null {
  return credentials()?.secretKey ?? null;
}

/* ---------------------------------------------------------------- calls -- */

/**
 * One POST to PayPlus.
 *
 * The response body is read as TEXT first and only then parsed. PayPlus
 * answers a rejected request with HTTP 422 and a PLAIN-TEXT body — assuming
 * JSON there throws inside the parser and loses the one thing that says what
 * was wrong. The text is carried into the result so it reaches the server log
 * intact.
 */
async function post(
  path: string,
  body: Record<string, unknown>,
): Promise<PayPlusResult<Record<string, unknown>>> {
  const creds = credentials();
  if (!creds) return fail("unconfigured", "PayPlus credentials are not set");

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": creds.apiKey,
        "secret-key": creds.secretKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    return fail("network", describe(error));
  }

  return readBody(response, path);
}

/** GET, for the one endpoint PayPlus exposes that way. */
async function get(
  path: string,
  query: Record<string, string>,
): Promise<PayPlusResult<Record<string, unknown>>> {
  const creds = credentials();
  if (!creds) return fail("unconfigured", "PayPlus credentials are not set");

  const search = new URLSearchParams(query).toString();

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/${path}?${search}`, {
      method: "GET",
      headers: {
        "api-key": creds.apiKey,
        "secret-key": creds.secretKey,
      },
      cache: "no-store",
    });
  } catch (error) {
    return fail("network", describe(error));
  }

  return readBody(response, path);
}

/** Shared text-first body handling. See the note on post(). */
async function readBody(
  response: Response,
  path: string,
): Promise<PayPlusResult<Record<string, unknown>>> {
  const text = await response.text().catch(() => "");

  if (!response.ok) {
    // 422 arrives as plain text. Truncated only so a runaway HTML error page
    // cannot flood the log.
    const detail = text.trim().slice(0, 500) || `no body`;
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
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

/* -------------------------------------------------------- generate link -- */

export interface PayPlusLineItem {
  /** Snapshot of what was bought, shown on the hosted page. */
  name: string;
  quantity: number;
  /** Unit price in shekels, decimal — PayPlus is not an agorot API. */
  price: number;
}

export interface PayPlusLinkRequest {
  /** Our own order uuid. Goes out as more_info and comes back on callbacks. */
  orderId: string;
  /** The total this server computed. Decimal shekels. */
  amount: number;
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
 * Mint a hosted payment page for an amount this server computed.
 *
 * `more_info` carries our order uuid so a callback arriving minutes later —
 * possibly after the buyer closed the tab — resolves back to the right row
 * without trusting anything in the URL the browser was sent to.
 *
 * charge_method 1 is a direct charge (not a J2 authorisation): the money is
 * taken on approval, which is what a store selling a physical shirt wants.
 * initial_invoice is false because this store issues no documents through
 * PayPlus; send_failure_callback is true so a decline reaches the webhook and
 * the pending row can be closed instead of sitting there forever.
 */
export async function generatePaymentLink(
  request: PayPlusLinkRequest,
): Promise<PayPlusResult<PayPlusLink>> {
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    return fail("api_error", "refusing to create a payment page for a non-positive total");
  }
  const creds = credentials();
  if (!creds) return fail("unconfigured", "PayPlus credentials are not set");

  const result = await post("PaymentPages/generateLink", {
    payment_page_uid: creds.paymentPageUid,
    charge_method: 1,
    amount: round2(request.amount),
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
    customer: {
      customer_name: request.customerName,
      email: request.customerEmail,
    },
    items: request.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: round2(item.price),
    })),
  });

  if (!result.ok) return result;

  const data = envelope(result.value);
  const pageRequestUid = data?.page_request_uid;
  const paymentPageLink = data?.payment_page_link;

  if (typeof pageRequestUid !== "string" || pageRequestUid === "") {
    return fail("invalid_response", "generateLink returned no page_request_uid");
  }
  if (typeof paymentPageLink !== "string" || paymentPageLink === "") {
    return fail("invalid_response", "generateLink returned no payment_page_link");
  }

  return { ok: true, value: { pageRequestUid, paymentPageLink } };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------ verify a payment -- */

/**
 * Ask PayPlus what happened, rather than believing what we were told.
 *
 * A callback body is a claim from the network. These two endpoints are the
 * source of truth, and the verdict (src/lib/payplus-protocol.ts) is computed
 * only from what they return.
 *
 * PaymentPages/ipn is keyed by the page request uid, which we stored when the
 * page was minted, so it works even when the callback carried nothing useful.
 */
export async function fetchPaymentPageStatus(
  pageRequestUid: string,
): Promise<PayPlusResult<PayPlusFacts>> {
  const result = await post("PaymentPages/ipn", {
    page_request_uid: pageRequestUid,
  });
  if (!result.ok) return result;
  return { ok: true, value: readPayPlusFacts(result.value) };
}

/** Transactions/View — keyed by the transaction uid a callback named. */
export async function fetchTransaction(
  transactionUid: string,
): Promise<PayPlusResult<PayPlusFacts>> {
  const result = await post("Transactions/View", {
    transaction_uid: transactionUid,
  });
  if (!result.ok) return result;
  return { ok: true, value: readPayPlusFacts(result.value) };
}

/**
 * The facts for one payment attempt, from whichever lookup can answer.
 *
 * The page lookup is tried first because the page request uid is ours and is
 * always on the order row. If it comes back without a status code — the page
 * exists but PayPlus has not attached an outcome to it — the transaction
 * lookup is tried with the uid the callback named. Neither answering is a
 * verification failure, not a decline.
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
    if (byTransaction.ok && byTransaction.value.statusCode !== null) {
      return byTransaction;
    }
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
 * Refund a settled transaction, in full or in part.
 *
 * Server helper only — there is no refund UI and there should not be one at
 * launch. Refunds are issued from the PayPlus dashboard or by calling this
 * from a script; giving the storefront a code path that moves money outwards
 * is a much bigger surface than the store needs.
 *
 * A smaller `amount` than the original is a partial refund. The caller is
 * responsible for not refunding more than was taken — PayPlus enforces it too,
 * and rejects with a 422 whose plain-text body says so.
 */
export async function refundTransaction(
  transactionUid: string,
  amount: number,
): Promise<PayPlusResult<PayPlusRefund>> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("api_error", "refusing to refund a non-positive amount");
  }

  const result = await post("Transactions/RefundByTransactionUID", {
    transaction_uid: transactionUid,
    amount: round2(amount),
  });
  if (!result.ok) return result;

  const facts = readPayPlusFacts(result.value);
  return {
    ok: true,
    value: { statusCode: facts.statusCode, transactionUid: facts.transactionUid },
  };
}

/* --------------------------------------------------------- charge methods -- */

/**
 * TODO(wallets): Bit, Apple Pay and Google Pay.
 *
 * NOTHING user-facing depends on this yet, and nothing should until it has
 * been run against a real account. Whether a wallet can be offered is not a
 * property of the code: each method has to be enabled on the PayPlus terminal
 * AND returned as available for this payment page uid, and rendering a wallet
 * button that the hosted page then refuses is a dead end in the middle of a
 * checkout.
 *
 * So the call exists and the buttons do not. When the owner has an account
 * with wallets enabled, run this, see what comes back for the real page uid,
 * and only then decide what to render.
 */
export async function fetchChargeMethods(): Promise<
  PayPlusResult<Record<string, unknown>>
> {
  const creds = credentials();
  if (!creds) return fail("unconfigured", "PayPlus credentials are not set");
  return get("PaymentPages/ChargeMethods", {
    payment_page_uid: creds.paymentPageUid,
  });
}
