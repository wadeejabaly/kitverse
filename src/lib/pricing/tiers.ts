/**
 * Tiered per-unit pricing, shared by the server pricing engine (engine.ts,
 * agorot/integer math) and the storefront's own display calculator
 * (src/data/pricing.ts, ILS/float math) so the two can never compute a
 * different total for the same count of units - see Addon.price_tiers in
 * ./schema.ts for the field this reads.
 *
 * The 1st unit costs tiers[0], the 2nd tiers[1], and so on; once `count`
 * exceeds the tiers array, every further unit repeats the last tier rather
 * than throwing or falling back to a flat price - a shirt with more patches
 * than the price list has named tiers for still prices sanely.
 */
export function tieredUnitPrice(tiers: readonly number[] | undefined, flatPrice: number, index: number): number {
  const list = tiers && tiers.length ? tiers : [flatPrice];
  return list[Math.min(index, list.length - 1)];
}

/** Sum of the first `count` tiered units (index 0..count-1). Both inputs are in whatever unit the caller works in (ILS or agorot) - this never rounds, callers round once at the end. */
export function tieredTotal(tiers: readonly number[] | undefined, flatPrice: number, count: number): number {
  if (count <= 0) return 0;
  let total = 0;
  for (let i = 0; i < count; i += 1) total += tieredUnitPrice(tiers, flatPrice, i);
  return total;
}
