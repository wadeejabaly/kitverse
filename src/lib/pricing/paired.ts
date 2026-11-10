/**
 * "Cheaper with a shirt" pricing for a per-order add-on (owner request
 * 2026-11-10: a scarf is ₪50, but ₪40 when bought with a shirt - one ₪40
 * scarf per shirt - for one day). Shared by the server pricing engine
 * (engine.ts, agorot) and the storefront's display calculator
 * (src/data/pricing.ts, ILS) so both always agree. Pure: the caller passes
 * `now`.
 */
export interface PairedPrice {
  price: number;                 // the price of a unit bought with a shirt
  per_shirt: number;             // how many units each shirt makes cheaper
  starts_at?: string | null;     // ISO; open-ended when absent
  ends_at?: string | null;       // ISO, exclusive
}

export function pairedActive(p: PairedPrice | undefined | null, now: Date): p is PairedPrice {
  if (!p) return false;
  if (p.starts_at && now < new Date(p.starts_at)) return false;
  if (p.ends_at && now >= new Date(p.ends_at)) return false;
  return true;
}

/** How many of `qty` units get the paired price, given `shirts` shirts in the same order. */
export function pairedCount(p: PairedPrice | undefined | null, qty: number, shirts: number, now: Date): number {
  if (!pairedActive(p, now) || qty <= 0 || shirts <= 0) return 0;
  return Math.min(qty, Math.floor(shirts * p.per_shirt));
}

/** Total for `qty` units: the paired ones at the paired price, the rest at `price`. Same unit as the inputs; never rounds. */
export function pairedTotal(price: number, p: PairedPrice | undefined | null, qty: number, shirts: number, now: Date): number {
  const cheap = pairedCount(p, qty, shirts, now);
  return cheap > 0 && p ? cheap * p.price + (qty - cheap) * price : qty * price;
}
