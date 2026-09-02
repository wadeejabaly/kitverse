import "server-only";

/**
 * PayPal REST — SERVER ONLY.
 *
 * `import "server-only"` is the guard that keeps PAYPAL_SECRET out of any
 * browser bundle. The only PayPal value the client ever sees is
 * NEXT_PUBLIC_PAYPAL_CLIENT_ID, which is public by design.
 *
 * Every function returns a discriminated result rather than throwing, because
 * this is the money path: a caller must be forced to look at the failure and
 * decide, not accidentally swallow an exception. Nothing here trusts a
 * response body it has not checked.
 *
 * PAYPAL_ENV decides where real money moves. It defaults to sandbox — the
 * safe direction — and only the exact string "live" switches it over.
 */

// The provider's fixed API hosts. These are PayPal's endpoints, not this
// site's domain, so they cannot derive from getSiteUrl(); scripts/preflight.mjs
// allows exactly these two hosts in exactly this file.
const API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export type PayPalEnv = keyof typeof API_BASE;

/** sandbox unless PAYPAL_ENV is exactly "live" — never guess towards live. */
export function getPayPalEnv(): PayPalEnv {
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

function apiBase(): string {
  return API_BASE[getPayPalEnv()];
}

export type PayPalErrorCode =
  | "unconfigured"
  | "auth_failed"
  | "network"
  | "api_error"
  | "invalid_response";

export type PayPalResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: PayPalErrorCode; detail: string };

function fail<T>(code: PayPalErrorCode, detail: string): PayPalResult<T> {
  return { ok: false, code, detail };
}

function credentials(): { clientId: string; secret: string } | null {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) return null;
  return { clientId, secret };
}

/** True when both the client id and the server secret are present. */
export function isPayPalConfigured(): boolean {
  return credentials() !== null;
}

/* ---------------------------------------------------------------- token -- */

/**
 * OAuth token cache. PayPal access tokens last ~9 hours; re-minting one per
 * request would add a round trip to every checkout. The margin means a token
 * about to expire mid-flight is refreshed rather than used and rejected.
 *
 * In-memory, so it is per server instance and is simply lost on a cold start —
 * which costs one extra token fetch, nothing more.
 */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<PayPalResult<string>> {
  const creds = credentials();
  if (!creds) return fail("unconfigured", "PayPal credentials are not set");

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - TOKEN_EXPIRY_MARGIN_MS > now) {
    return { ok: true, value: tokenCache.token };
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.secret}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
  } catch (error) {
    return fail("network", describe(error));
  }

  if (!response.ok) {
    return fail("auth_failed", `token endpoint returned ${response.status}`);
  }

  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;

  if (!body || typeof body.access_token !== "string") {
    return fail("invalid_response", "token response had no access_token");
  }

  const expiresInSeconds =
    typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 300;

  tokenCache = { token: body.access_token, expiresAt: now + expiresInSeconds * 1000 };
  return { ok: true, value: body.access_token };
}

/* ----------------------------------------------------------------- calls -- */

interface CallOptions {
  path: string;
  body?: unknown;
  /** PayPal-Request-Id — makes a retried create idempotent on PayPal's side. */
  requestId?: string;
}

async function post(
  options: CallOptions,
): Promise<PayPalResult<Record<string, unknown>>> {
  const token = await getAccessToken();
  if (!token.ok) return token;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.value}`,
    "Content-Type": "application/json",
  };
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;

  let response: Response;
  try {
    response = await fetch(`${apiBase()}${options.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(options.body ?? {}),
      cache: "no-store",
    });
  } catch (error) {
    return fail("network", describe(error));
  }

  const json = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    const detail =
      json && typeof json.message === "string"
        ? json.message
        : `PayPal returned ${response.status}`;
    return fail("api_error", detail);
  }
  if (!json) return fail("invalid_response", "PayPal returned a non-JSON body");

  return { ok: true, value: json };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/* ---------------------------------------------------------- create order -- */

/**
 * Create a PayPal order for an amount this server computed.
 *
 * `orderId` is our own uuid: it goes out as invoice_id AND custom_id so that
 * a webhook arriving later can be resolved back to our row from either field,
 * and as PayPal-Request-Id so a retry cannot produce two PayPal orders for
 * one of ours.
 *
 * No shipping address is collected: we already have it from our own form, and
 * asking twice invites the two to disagree about where the parcel goes.
 */
export async function createOrder(
  totalILS: number,
  orderId: string,
): Promise<PayPalResult<{ paypalOrderId: string }>> {
  if (!Number.isFinite(totalILS) || totalILS <= 0) {
    return fail("api_error", "refusing to create an order for a non-positive total");
  }

  const result = await post({
    path: "/v2/checkout/orders",
    requestId: orderId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          invoice_id: orderId,
          custom_id: orderId,
          amount: { currency_code: "ILS", value: totalILS.toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
          },
        },
      },
    },
  });

  if (!result.ok) return result;

  const id = result.value.id;
  if (typeof id !== "string" || id === "") {
    return fail("invalid_response", "created order had no id");
  }
  return { ok: true, value: { paypalOrderId: id } };
}

/* --------------------------------------------------------- capture order -- */

export interface CaptureOutcome {
  /** PayPal's order status — only "COMPLETED" means money moved. */
  status: string;
  /** The capture id we store on the order row, when PayPal returned one. */
  captureId: string | null;
}

export async function captureOrder(
  paypalOrderId: string,
): Promise<PayPalResult<CaptureOutcome>> {
  const result = await post({ path: `/v2/checkout/orders/${paypalOrderId}/capture` });
  if (!result.ok) return result;

  const status = result.value.status;
  if (typeof status !== "string") {
    return fail("invalid_response", "capture response had no status");
  }

  return { ok: true, value: { status, captureId: readCaptureId(result.value) } };
}

/** Dig `purchase_units[0].payments.captures[0].id` out of an unknown shape. */
function readCaptureId(payload: Record<string, unknown>): string | null {
  const units = payload.purchase_units;
  if (!Array.isArray(units) || units.length === 0) return null;
  const unit = units[0] as { payments?: { captures?: unknown } } | null;
  const captures = unit?.payments?.captures;
  if (!Array.isArray(captures) || captures.length === 0) return null;
  const capture = captures[0] as { id?: unknown } | null;
  return typeof capture?.id === "string" ? capture.id : null;
}

/* ------------------------------------------------------ webhook signature -- */

/** The five headers PayPal signs a webhook with. */
const SIGNATURE_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

/**
 * Verify a webhook against PayPal's own verification endpoint.
 *
 * The payload is NEVER trusted on its own: anyone can POST JSON claiming a
 * payment completed. The event body is sent back to PayPal verbatim (parsed
 * from the RAW request body — re-serialising a parsed object can change key
 * order or number formatting and break the signature) together with the five
 * transmission headers and our PAYPAL_WEBHOOK_ID.
 *
 * Any verification_status other than SUCCESS is invalid. So is a missing
 * header, a cert_url that is not a paypal.com host, or a missing webhook id.
 */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<PayPalResult<true>> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return fail("unconfigured", "PAYPAL_WEBHOOK_ID is not set");

  const values: Record<string, string> = {};
  for (const name of SIGNATURE_HEADERS) {
    const value = headers.get(name);
    if (!value) return fail("api_error", `missing ${name} header`);
    values[name] = value;
  }

  // The certificate must come from PayPal. Without this check a forged event
  // could point verification at an attacker-controlled certificate host.
  let certHost: string;
  try {
    certHost = new URL(values["paypal-cert-url"]).hostname;
  } catch {
    return fail("api_error", "cert url is not a valid URL");
  }
  if (certHost !== "paypal.com" && !certHost.endsWith(".paypal.com")) {
    return fail("api_error", "cert url is not a paypal.com host");
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return fail("api_error", "webhook body was not valid JSON");
  }

  const result = await post({
    path: "/v1/notifications/verify-webhook-signature",
    body: {
      auth_algo: values["paypal-auth-algo"],
      cert_url: values["paypal-cert-url"],
      transmission_id: values["paypal-transmission-id"],
      transmission_sig: values["paypal-transmission-sig"],
      transmission_time: values["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: event,
    },
  });

  if (!result.ok) return result;

  // Treat anything that is not an explicit SUCCESS as a failed verification.
  if (result.value.verification_status !== "SUCCESS") {
    return fail(
      "api_error",
      `verification_status was ${String(result.value.verification_status)}`,
    );
  }
  return { ok: true, value: true };
}

/** Test seam: drop the cached OAuth token (used when env changes at runtime). */
export function resetTokenCache(): void {
  tokenCache = null;
}
