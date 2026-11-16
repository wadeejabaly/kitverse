/**
 * Browser-safe discount rules shared by checkout (CheckoutView) and the server (src/lib/orders/web.ts),
 * so what the shopper sees is exactly what the order is charged.
 *
 * Combining (owner decisions 2026-10-26 + 2026-11-16):
 *  - one code alone is always fine;
 *  - several codes combine when EVERY one is `stackable`;
 *  - or exactly two: the running dated SALE code (dates set, for everyone, unlimited uses - e.g.
 *    BLACKFRIDAY15) + a code marked `combinesWithSale` (the riddle winner's ₪50 coupon).
 *
 * Amounts (owner 2026-11-16: "15% applies only after the 50 is deducted"): fixed-₪ codes are taken
 * first; percent codes are then worked out on what is left of their base.
 */
export type RuleCode = {
  kind: "percent" | "fixed";
  /** percent: 0-100; fixed: in the same money unit as the totals passed in */
  value: number;
  appliesTo?: "order" | "shirts";
  stackable: boolean;
  combinesWithSale?: boolean;
  isSale?: boolean;
};

export function canCombine(codes: Pick<RuleCode, "stackable" | "combinesWithSale" | "isSale">[]): boolean {
  if (codes.length <= 1) return true;
  if (codes.every((c) => c.stackable)) return true;
  return codes.length === 2 && codes.some((c) => c.isSale) && codes.some((c) => !c.isSale && c.combinesWithSale);
}

/** Each code's amount, in the order given; fixed codes first, then percents on the remainder. */
export function codeAmounts(codes: RuleCode[], itemsTotal: number, shirtsTotal: number, round = (n: number) => Math.round(n)): number[] {
  const out = new Array<number>(codes.length).fill(0);
  let itemsLeft = itemsTotal;
  let shirtsLeft = Math.min(shirtsTotal, itemsTotal);
  codes.forEach((c, i) => {
    if (c.kind !== "fixed") return;
    const base = c.appliesTo === "shirts" ? shirtsLeft : itemsLeft;
    const amt = Math.max(0, Math.min(c.value, base));
    out[i] = amt;
    itemsLeft -= amt;
    shirtsLeft = Math.max(0, Math.min(shirtsLeft - amt, itemsLeft));
  });
  codes.forEach((c, i) => {
    if (c.kind !== "percent") return;
    const base = c.appliesTo === "shirts" ? shirtsLeft : itemsLeft;
    out[i] = Math.max(0, Math.min(round((base * c.value) / 100), base));
  });
  return out;
}

/** The dated, for-everyone, unlimited sale code (what the site banner calls the sale). */
export function isSaleRow(r: { starts_at: string | null; ends_at: string | null; first_order_only: boolean; max_uses: number | null }): boolean {
  return !!r.starts_at && !!r.ends_at && !r.first_order_only && r.max_uses == null;
}
