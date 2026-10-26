import "server-only";
import { db } from "./db";

/**
 * Discount codes (owner feature 2026-10-26): a reusable code a shopper types
 * at checkout, separate from the per-order owner/bot discount approval flow
 * (src/app/admin/actions.ts decideApproval). Generated and managed in admin
 * Discounts (src/app/admin/discounts-actions.ts); applied at checkout in
 * src/lib/orders/web.ts.
 *
 * Money: `value` and `min_order` are agorot for a 'fixed' code, same as every
 * other money column in the schema; for a 'percent' code `value` is plain
 * percentage points (e.g. 10 = 10%), unitless.
 *
 * A code never needs an approval row (the `adjustments` table's own check
 * constraint says so: "codes carry their own authority") — it carries its
 * own eligibility rules (dates, minimum order, use cap) instead.
 */
export type DiscountCode = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  min_order: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  created_at: string;
};

export type DiscountLookup =
  | { ok: true; row: DiscountCode }
  | { ok: false; reason: "not_found" | "inactive" | "not_started" | "expired" | "used_up" };

const normalizeCode = (raw: string) => raw.trim().toUpperCase();

/** Looks up a code and checks every eligibility rule EXCEPT minimum order (which needs the actual cart total — see discountAmount). */
export async function findActiveDiscountCode(raw: string): Promise<DiscountLookup> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, reason: "not_found" };
  const row = (await db().from("discount_codes").select("*").eq("code", code).maybeSingle()).data as DiscountCode | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.active) return { ok: false, reason: "inactive" };
  const now = new Date();
  if (row.starts_at && now < new Date(row.starts_at)) return { ok: false, reason: "not_started" };
  if (row.ends_at && now > new Date(row.ends_at)) return { ok: false, reason: "expired" };
  if (row.max_uses != null && row.used_count >= row.max_uses) return { ok: false, reason: "used_up" };
  return { ok: true, row };
}

/** The agorot amount a code is worth against a given items subtotal (0 if the subtotal doesn't meet min_order). Never exceeds the subtotal. */
export function discountAmount(row: Pick<DiscountCode, "kind" | "value" | "min_order">, itemsSubtotalAgorot: number): number {
  if (itemsSubtotalAgorot < row.min_order) return 0;
  const raw = row.kind === "percent" ? Math.round((itemsSubtotalAgorot * row.value) / 100) : row.value;
  return Math.max(0, Math.min(raw, itemsSubtotalAgorot));
}

/**
 * Marks one use of a code — call only once an order has actually been placed
 * with it (src/lib/orders/web.ts). Read-then-write: this store's traffic is
 * small enough that a lost increment from two simultaneous orders on the
 * exact same code is an acceptable risk, same tradeoff the rest of this
 * codebase makes rather than adding transactions (see requote() in
 * src/lib/orders/draft.ts).
 */
export async function recordDiscountCodeUse(code: string): Promise<void> {
  const row = (await db().from("discount_codes").select("used_count").eq("code", normalizeCode(code)).maybeSingle()).data as { used_count: number } | null;
  if (!row) return;
  await db().from("discount_codes").update({ used_count: row.used_count + 1 }).eq("code", normalizeCode(code));
}
