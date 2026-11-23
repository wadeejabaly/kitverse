import { israelDay } from "./customer-stage";

/**
 * Estimated arrival shown to the customer on the order page (owner request 2026-11-13: "estimated
 * arrival date, not 10-20 days"). Pure - tested in eta.test.ts. Days are Israel calendar days,
 * returned as "YYYY-MM-DD".
 *
 *  - owner timeline 2026-11-23 (customer-stage.ts): out for delivery from day 18 to day 25 after
 *    confirmation, so the window is day 18 - day 25; once the first date has passed the window starts
 *    tomorrow, and after the last one the page just says "very soon";
 *  - marked out for delivery by hand earlier than that: 1-3 days from the day it went out;
 *  - delivered / not confirmed: nothing.
 */

export const ETA_DAYS = { min: 18, max: 25 } as const;
export const ETA_COURIER_DAYS = { min: 1, max: 3 } as const;

const IN_PROGRESS = ["confirmed", "paid", "in_supplier_batch", "produced", "at_warehouse", "with_courier"];

export type Eta = { kind: "window"; from: string; to: string } | { kind: "soon" } | null;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** `n` working days (Sunday-Thursday) after `day`. */
export function addWorkingDays(day: Date, n: number): Date {
  let d = day;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    const wd = d.getUTCDay(); // 5 = Friday, 6 = Saturday
    if (wd !== 5 && wd !== 6) left--;
  }
  return d;
}

export function estimatedArrival(o: { status: string; confirmedAt: string | null; outForDeliveryAt?: string | null }, now = new Date()): Eta {
  if (!IN_PROGRESS.includes(o.status) || !o.confirmedAt) return null;
  const today = israelDay(now);
  const start = israelDay(new Date(o.confirmedAt));
  let from = addDays(start, ETA_DAYS.min);
  let to = addDays(start, ETA_DAYS.max);
  if (o.status === "with_courier" && o.outForDeliveryAt) {
    // sent out by hand before the timeline's own delivery days: the courier's 1-3 days instead
    const out = israelDay(new Date(o.outForDeliveryAt));
    if (addDays(out, ETA_COURIER_DAYS.max) < from) { from = addDays(out, ETA_COURIER_DAYS.min); to = addDays(out, ETA_COURIER_DAYS.max); }
  }
  if (today >= to) return { kind: "soon" };
  if (today >= from) from = addDays(today, 1);
  return { kind: "window", from: iso(from), to: iso(to) };
}
