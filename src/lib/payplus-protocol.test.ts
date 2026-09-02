import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PAYPLUS_APPROVED_STATUS_CODE,
  decidePayPlusVerdict,
  readPayPlusFacts,
  signWebhookBody,
  verifyWebhookRequest,
  type PayPlusFacts,
} from "@/lib/payplus-protocol";

/**
 * The PayPlus money path's unit tests. Three things are being pinned down:
 *
 *   1. a callback is authenticated by an HMAC over the RAW body, and a forged
 *      or tampered one is rejected;
 *   2. the verdict is status_code === "000" and NOTHING else — in particular
 *      an envelope saying `status: "success"` around a declined card must not
 *      pay an order;
 *   3. the amount PayPlus reports is checked against the amount this server
 *      priced, so an approved payment for the wrong money settles nothing.
 */

const SECRET = "test-secret-key-0123456789";

/** The signature computed independently of the implementation under test. */
function expectedHash(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("webhook authentication", () => {
  const body = JSON.stringify({
    transaction: { uid: "TXN-1", status_code: "000", amount: 204 },
  });

  it("signs the raw body with HMAC-SHA256, base64", () => {
    expect(signWebhookBody(body, SECRET)).toBe(expectedHash(body));
  });

  it("matches a known vector", () => {
    // Fixed input, fixed key, fixed answer: if the algorithm, the encoding or
    // the digest ever changes, this fails rather than silently rejecting
    // every real callback in production.
    expect(signWebhookBody("payplus", "key")).toBe(
      "xXNYIVKeunEW5rJ2aZ7zzYLYWK/TP1ES/46CWpWRugw=",
    );
  });

  it("accepts a correctly signed PayPlus callback", () => {
    expect(
      verifyWebhookRequest({
        userAgent: "PayPlus",
        hashHeader: expectedHash(body),
        rawBody: body,
        secretKey: SECRET,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a body that was tampered with after signing", () => {
    const signature = expectedHash(body);
    const tampered = body.replace('"amount":204', '"amount":1');
    expect(
      verifyWebhookRequest({
        userAgent: "PayPlus",
        hashHeader: signature,
        rawBody: tampered,
        secretKey: SECRET,
      }),
    ).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a signature made with the wrong key", () => {
    expect(
      verifyWebhookRequest({
        userAgent: "PayPlus",
        hashHeader: expectedHash(body, "not-our-secret"),
        rawBody: body,
        secretKey: SECRET,
      }),
    ).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a missing hash header and a wrong user agent", () => {
    expect(
      verifyWebhookRequest({
        userAgent: "PayPlus",
        hashHeader: null,
        rawBody: body,
        secretKey: SECRET,
      }),
    ).toEqual({ ok: false, reason: "missing-hash" });

    expect(
      verifyWebhookRequest({
        userAgent: "curl/8.4.0",
        hashHeader: expectedHash(body),
        rawBody: body,
        secretKey: SECRET,
      }),
    ).toEqual({ ok: false, reason: "wrong-user-agent" });
  });

  it("rejects a hash of the wrong length without throwing", () => {
    // timingSafeEqual throws on mismatched lengths; the length is compared
    // first so a truncated forgery is a rejection, not a 500.
    expect(() =>
      verifyWebhookRequest({
        userAgent: "PayPlus",
        hashHeader: "short",
        rawBody: body,
        secretKey: SECRET,
      }),
    ).not.toThrow();
    expect(
      verifyWebhookRequest({
        userAgent: "PayPlus",
        hashHeader: "short",
        rawBody: body,
        secretKey: SECRET,
      }).ok,
    ).toBe(false);
  });
});

describe("reading PayPlus payloads", () => {
  it("finds fields whether they sit at the top level, under transaction, or under data", () => {
    expect(
      readPayPlusFacts({
        transaction: {
          uid: "TXN-7",
          status_code: "000",
          amount: 204,
          currency: "ILS",
          more_info: "order-uuid",
          page_request_uid: "PAGE-1",
        },
      }),
    ).toEqual({
      orderId: "order-uuid",
      pageRequestUid: "PAGE-1",
      transactionUid: "TXN-7",
      statusCode: "000",
      amount: 204,
      currency: "ILS",
    });

    expect(
      readPayPlusFacts({
        results: { status: "success", code: 0 },
        data: { transaction_uid: "TXN-8", status_code: "000", amount: "169.00" },
      }),
    ).toMatchObject({ transactionUid: "TXN-8", statusCode: "000", amount: 169 });
  });

  it("never reads the envelope's `status` as a status code", () => {
    // `results.status: "success"` describes the API call, not the money.
    const facts = readPayPlusFacts({ results: { status: "success" } });
    expect(facts.statusCode).toBeNull();
  });

  it("returns all-null for a malformed payload instead of throwing", () => {
    for (const payload of [null, "nonsense", 42, []]) {
      expect(readPayPlusFacts(payload)).toEqual({
        orderId: null,
        pageRequestUid: null,
        transactionUid: null,
        statusCode: null,
        amount: null,
        currency: null,
      });
    }
  });
});

describe("decidePayPlusVerdict — status_code '000' and nothing else", () => {
  const approved: PayPlusFacts = {
    orderId: "order-uuid",
    pageRequestUid: "PAGE-1",
    transactionUid: "TXN-1",
    statusCode: PAYPLUS_APPROVED_STATUS_CODE,
    amount: 204,
    currency: "ILS",
  };
  const expected = { amount: 204, currency: "ILS" };

  it("pays only on an exact '000'", () => {
    expect(decidePayPlusVerdict(approved, expected)).toEqual({
      paid: true,
      transactionUid: "TXN-1",
    });
  });

  /**
   * The trap this whole module exists for: PayPlus answers a DECLINE with
   * HTTP 200 and an envelope that says the API call succeeded. Only the
   * status code speaks for the money.
   */
  it("does NOT pay a declined card that arrived inside a 'success' envelope", () => {
    const declined = readPayPlusFacts({
      results: { status: "success", description: "payment page found" },
      data: {
        transaction_uid: "TXN-1",
        status_code: "039",
        amount: 204,
        currency: "ILS",
      },
    });
    const verdict = decidePayPlusVerdict(declined, expected);
    expect(verdict.paid).toBe(false);
    expect(verdict).toMatchObject({ reason: "not-approved" });
  });

  it("does not accept the near-misses of '000'", () => {
    for (const statusCode of ["0", "00", "0000", "000 ", "ok", "success", ""]) {
      expect(
        decidePayPlusVerdict({ ...approved, statusCode }, expected).paid,
        `status_code "${statusCode}" must not pay an order`,
      ).toBe(false);
    }
    // A numeric zero stringifies to "0", not "000".
    expect(
      decidePayPlusVerdict(
        readPayPlusFacts({ status_code: 0, transaction_uid: "T", amount: 204, currency: "ILS" }),
        expected,
      ).paid,
    ).toBe(false);
  });

  it("does not pay when the status code is absent altogether", () => {
    expect(decidePayPlusVerdict({ ...approved, statusCode: null }, expected)).toMatchObject(
      { paid: false, reason: "not-approved" },
    );
  });

  it("refuses an approved payment for the wrong amount or currency", () => {
    expect(
      decidePayPlusVerdict({ ...approved, amount: 1 }, expected),
    ).toMatchObject({ paid: false, reason: "amount-mismatch" });
    expect(
      decidePayPlusVerdict({ ...approved, amount: null }, expected),
    ).toMatchObject({ paid: false, reason: "amount-mismatch" });
    expect(
      decidePayPlusVerdict({ ...approved, currency: "USD" }, expected),
    ).toMatchObject({ paid: false, reason: "currency-mismatch" });
  });

  it("tolerates decimal noise but not a real difference", () => {
    expect(decidePayPlusVerdict({ ...approved, amount: 204.001 }, expected).paid).toBe(
      true,
    );
    expect(decidePayPlusVerdict({ ...approved, amount: 203.99 }, expected).paid).toBe(
      false,
    );
  });

  it("refuses an approved payment with nothing to record against the order", () => {
    expect(
      decidePayPlusVerdict({ ...approved, transactionUid: null }, expected),
    ).toMatchObject({ paid: false, reason: "missing-transaction-uid" });
  });

  it("refuses when the lookup returned nothing at all", () => {
    expect(decidePayPlusVerdict(null, expected)).toMatchObject({
      paid: false,
      reason: "no-facts",
    });
  });
});
