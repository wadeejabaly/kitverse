import "server-only";

/**
 * Cash on delivery by Bit deposit — SERVER ONLY.
 *
 * There is no integration here, and that is the point. Bit has no API this
 * store can call: the buyer opens their own Bit app and sends the deposit to
 * the owner's number, the owner sees it arrive, and the owner moves the order
 * from `awaiting_deposit` to `paid` in the Supabase dashboard. This module
 * therefore owns exactly one fact — the phone number to send the money to —
 * and the rule about who may see it.
 *
 * `import "server-only"` on line 1 is the enforcement. BIT_PHONE_NUMBER is
 * never NEXT_PUBLIC_ and never crosses into a client bundle: it is a real
 * personal number, it identifies the owner, and a public build artifact is a
 * poor place to publish one. It reaches a browser in exactly one situation —
 * rendered server-side into the confirmation page of an order that has just
 * been placed, by a buyer who now needs it to pay. No other page, and no API
 * response, carries it.
 *
 * Absent env is a first-class state: with BIT_PHONE_NUMBER unset the method
 * simply does not exist. It is not shown at checkout, the start route answers
 * `payments_unconfigured`, and the store still builds and runs.
 */

/** Digits, spaces, +, -, and parentheses — a phone number and nothing else. */
const PHONE_SHAPE = /^[+()\-\s0-9]{7,24}$/;

/**
 * The owner's Bit-registered number, or null when it is unset or malformed.
 *
 * The shape check is not validation theatre: this string is printed to a buyer
 * as the destination for their money, so a value that is not phone-shaped is
 * treated as no value at all rather than displayed. That closes the method
 * instead of pointing money at a typo.
 */
export function getBitPhoneNumber(): string | null {
  const raw = process.env.BIT_PHONE_NUMBER;
  if (!raw) return null;
  const trimmed = raw.trim();
  return PHONE_SHAPE.test(trimmed) ? trimmed : null;
}

/** True when cash on delivery can be offered at all. */
export function isBitCodConfigured(): boolean {
  return getBitPhoneNumber() !== null;
}
