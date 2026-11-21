import "server-only";
import { canCombine, isSaleRow } from "./discount-rules";
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
  // Owner decision 2026-10-26: can this code be used together with other
  // codes on the same order? Default false (every code created before this
  // existed keeps its old, exclusive-only behaviour).
  stackable: boolean;
  // Owner request 2026-11-10 ("30 shekels off your first order from 300"):
  // only for a shopper whose phone has no earlier real order.
  first_order_only: boolean;
  /** Owner request 2026-11-15: what the code is taken off - "order" (items total) or "shirts" (shirt/kit price only). */
  applies_to?: "order" | "shirts";
  /** Owner request 2026-11-16: may be used together with the running dated sale code (and only that one). */
  combines_with_sale?: boolean;
  /** Owner request 2026-11-21: the code also makes delivery free (e.g. KV25). */
  free_delivery?: boolean;
  created_at: string;
};

export type DiscountLookup =
  | { ok: true; row: DiscountCode }
  | { ok: false; reason: "not_found" | "inactive" | "not_started" | "expired" | "used_up" };

export const normalizeCode = (raw: string) => raw.trim().toUpperCase();

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

/**
 * Whether a set of codes is allowed to apply together on one order. A single
 * code never needs permission; two or more are only allowed when EVERY one
 * of them is marked stackable - one exclusive code in the mix means the
 * shopper has to pick just that one.
 */
export function codesCanCombine(rows: (Pick<DiscountCode, "stackable"> & Partial<Pick<DiscountCode, "combines_with_sale" | "starts_at" | "ends_at" | "first_order_only" | "max_uses">>)[]): boolean {
  return canCombine(rows.map((r) => ({
    stackable: r.stackable,
    combinesWithSale: r.combines_with_sale === true,
    isSale: isSaleRow({ starts_at: r.starts_at ?? null, ends_at: r.ends_at ?? null, first_order_only: r.first_order_only ?? false, max_uses: r.max_uses ?? null }),
  })));
}

/**
 * True when this phone number already has an order that went past "draft"
 * (an unpaid PayPal/Bit attempt stays a draft) and wasn't cancelled - i.e. it
 * is NOT this shopper's first order. Every customer row with that phone
 * counts (a website buyer, or an Instagram customer the owner recorded a
 * phone for).
 */
export async function hasEarlierOrder(phone: string): Promise<boolean> {
  const customers = ((await db().from("customers").select("id").eq("phone", phone)).data ?? []) as { id: string }[];
  if (!customers.length) return false;
  const r = await db()
    .from("orders")
    .select("id")
    .in("customer_id", customers.map((c) => c.id))
    // an unpaid online / manual-payment checkout that never went anywhere ("quoted") is not an order yet
    .not("status", "in", "(draft,quoted,cancelled)")
    .limit(1);
  if (r.error) throw new Error(`first-order check: ${r.error.message}`);
  return (r.data ?? []).length > 0;
}

/**
 * The agorot amount a code is worth (0 if the items subtotal doesn't meet min_order). The minimum is
 * always measured on the whole items subtotal; the cut is taken off that subtotal, or - for a code with
 * applies_to "shirts" (owner request 2026-11-15) - off the shirts' and kits' own price only
 * (`shirtsSubtotalAgorot`: no names, patches, gift boxes or accessories). Never exceeds what it's taken off.
 */
export function discountAmount(
  row: Pick<DiscountCode, "kind" | "value" | "min_order"> & { applies_to?: string | null },
  itemsSubtotalAgorot: number,
  shirtsSubtotalAgorot: number = itemsSubtotalAgorot,
): number {
  if (itemsSubtotalAgorot < row.min_order) return 0;
  const base = row.applies_to === "shirts" ? Math.min(shirtsSubtotalAgorot, itemsSubtotalAgorot) : itemsSubtotalAgorot;
  const raw = row.kind === "percent" ? Math.round((base * row.value) / 100) : row.value;
  return Math.max(0, Math.min(raw, base));
}

/** The shirts' and kits' own price in a quote (agorot): unit price + its 3XL/4XL size price, times qty - no names or patches. */
export function shirtsSubtotal(q: { lines: { unitPrice: number; qty: number; addons: { id: string; amount: number }[] }[] }): number {
  return q.lines.reduce((s, l) => s + (l.unitPrice + l.addons.filter((a) => a.id.startsWith("size_")).reduce((x, a) => x + a.amount, 0)) * l.qty, 0);
}

/**
 * Claims one use of a code. Compare-and-set on used_count (retried a few times), so two orders at the
 * same moment can't both take the last use or push past max_uses. Returns false when the code is
 * used up (or gone). Cash orders claim when placed; PayPal/Bit only once the payment has settled.
 */
export async function recordDiscountCodeUse(code: string): Promise<boolean> {
  const c = normalizeCode(code);
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = (await db().from("discount_codes").select("used_count,max_uses").eq("code", c).maybeSingle()).data as { used_count: number; max_uses: number | null } | null;
    if (!row) return false;
    if (row.max_uses != null && row.used_count >= row.max_uses) return false;
    const won = await db().from("discount_codes").update({ used_count: row.used_count + 1 }).eq("code", c).eq("used_count", row.used_count).select("code");
    if ((won.data ?? []).length) return true;
  }
  return false;
}
