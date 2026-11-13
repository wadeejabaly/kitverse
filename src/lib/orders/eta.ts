/**
 * Estimated arrival shown to the customer on the order page (owner request 2026-11-13: "estimated
 * arrival date, not 10-20 days"). Pure - tested in eta.test.ts. Days are Israel calendar days,
 * returned as "YYYY-MM-DD".
 *
 *  - before the shipment reaches the owner: 10-20 working days from confirmation (Friday and Saturday
 *    are not working days - the page always said so); once the first date has passed the window
 *    starts tomorrow, and after the last one the page just says "very soon";
 *  - out for delivery (`with_courier`): 1-3 days from the day it went out (the owner's 24-72 hours);
 *  - delivered / not confirmed: nothing.
 */

export const ETA_WORKING_DAYS = { min: 10, max: 20 } as const;
export const ETA_COURIER_DAYS = { min: 1, max: 3 } as const;

const IN_PROGRESS = ["confirmed", "paid", "in_supplier_batch", "produced", "at_warehouse"];

export type Eta = { kind: "window"; from: string; to: string } | { kind: "soon" } | null;

/** Israel calendar day of an instant, as a UTC-midnight Date (so day math is plain UTC math). */
function israelDay(t: Date): Date {
  const [y, m, d] = t.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
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
  const today = israelDay(now);
  if (o.status === "with_courier") {
    const out = israelDay(o.outForDeliveryAt ? new Date(o.outForDeliveryAt) : now);
    let from = addDays(out, ETA_COURIER_DAYS.min);
    const to = addDays(out, ETA_COURIER_DAYS.max);
    if (today >= to) return { kind: "soon" };
    if (today >= from) from = addDays(today, 1);
    return { kind: "window", from: iso(from), to: iso(to) };
  }
  if (!IN_PROGRESS.includes(o.status) || !o.confirmedAt) return null;
  const start = israelDay(new Date(o.confirmedAt));
  let from = addWorkingDays(start, ETA_WORKING_DAYS.min);
  const to = addWorkingDays(start, ETA_WORKING_DAYS.max);
  if (today >= to) return { kind: "soon" };
  if (today >= from) from = addDays(today, 1);
  return { kind: "window", from: iso(from), to: iso(to) };
}
