import { cn } from "@/lib/utils";

/**
 * Bidi-isolated numeric display primitives.
 *
 * Inside RTL copy an unisolated "₪95" reorders — the shekel sign jumps to the
 * wrong end of the number, and a price next to Arabic text can end up reading
 * backwards. Every price, every season and every figure on this storefront
 * goes through one of these, so the isolation is structural rather than
 * something a component author has to remember.
 */

/**
 * Formats an ILS amount: whole shekels print bare ("95"), anything with
 * cents prints to exactly two decimals ("34.99", "106.99"). Almost every
 * price on this site is a whole number, so this only ever bites on the two
 * fractional add-ons (the official patch, the gift box) and any total that
 * includes one of them — it never turns an ordinary "95" into "95.00".
 */
function formatIls(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/** A price in shekels: always LTR, always tabular. */
export function Price({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={cn("tabular", className)}>
      ₪{formatIls(value)}
    </bdi>
  );
}

/** A season label — "25/26", "2026". Latin numerals, isolated. */
export function Season({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={cn("tabular", className)}>
      {value}
    </bdi>
  );
}

/** Any bare figure inside prose or a meta row — counts, quantities, sizes. */
export function Figure({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={cn("tabular", className)}>
      {children}
    </bdi>
  );
}
