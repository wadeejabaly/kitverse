/**
 * What the CUSTOMER sees of an order's progress (owner request 2026-11-23): a fixed timeline counted
 * in Israel calendar days from the day the order was confirmed (day 0), not the internal status:
 *
 *   day 0-2   received / paid
 *   day 3-6   in production
 *   day 7-9   produced, preparing to be sent to our warehouse
 *   day 10-13 on the way to our warehouse
 *   day 14-17 at our warehouse
 *   day 18+   out for delivery (being delivered to you) - stays here until the owner marks it delivered
 *   delivered only when the order's status is `delivered` (set by hand)
 *
 * If the owner moved an order further by hand (e.g. out for delivery early), the page shows that
 * instead - it never goes backwards. Pure; tested in customer-stage.test.ts. Used by the order page
 * `/o/[token]`, the `/o/track` lookup, the DM bot's order-status tool and the owner's WhatsApp texts
 * (through eta.ts).
 */

export const CUSTOMER_STAGES = ["received", "production", "produced", "to_warehouse", "at_warehouse", "with_courier", "delivered"] as const;
export type CustomerStage = (typeof CUSTOMER_STAGES)[number];

/** First day (since confirmation) of each stage before "delivered". */
export const STAGE_START_DAY: Record<Exclude<CustomerStage, "delivered">, number> = {
  received: 0, production: 3, produced: 7, to_warehouse: 10, at_warehouse: 14, with_courier: 18,
};

/** The furthest stage an internal status already proves (so a hand-set status is never shown behind). */
const STATUS_FLOOR: Record<string, CustomerStage> = {
  confirmed: "received", paid: "received", in_supplier_batch: "production",
  produced: "to_warehouse", at_warehouse: "at_warehouse", with_courier: "with_courier", delivered: "delivered",
};

/** Israel calendar day of an instant, as a UTC-midnight Date (so day math is plain UTC math). */
export function israelDay(t: Date): Date {
  const [y, m, d] = t.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Whole Israel days from `confirmedAt` to `now` (0 on the day itself). */
export function daysSinceConfirmed(confirmedAt: string, now = new Date()): number {
  return Math.max(0, Math.round((israelDay(now).getTime() - israelDay(new Date(confirmedAt)).getTime()) / 86_400_000));
}

/** The stage to show, or null when the order isn't confirmed (or is cancelled / has an issue). */
export function customerStage(o: { status: string; confirmedAt: string | null }, now = new Date()): CustomerStage | null {
  if (o.status === "delivered") return "delivered";
  const floor = STATUS_FLOOR[o.status];
  if (!floor || !o.confirmedAt) return null;
  const day = daysSinceConfirmed(o.confirmedAt, now);
  let byTime: CustomerStage = "received";
  for (const s of CUSTOMER_STAGES) if (s !== "delivered" && day >= STAGE_START_DAY[s]) byTime = s;
  return CUSTOMER_STAGES.indexOf(floor) > CUSTOMER_STAGES.indexOf(byTime) ? floor : byTime;
}

/** Short English meaning of each stage (the DM bot's order-status tool). */
export const STAGE_MEANING_EN: Record<CustomerStage, string> = {
  received: "order received and confirmed",
  production: "in production",
  produced: "produced, being prepared to be sent to our warehouse",
  to_warehouse: "on its way to our warehouse",
  at_warehouse: "at our warehouse",
  with_courier: "out for delivery - being delivered to the customer, the courier calls a day before",
  delivered: "delivered",
};
