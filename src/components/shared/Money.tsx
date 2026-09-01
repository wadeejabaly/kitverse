import { cn } from "@/lib/utils";

/**
 * Bidi-isolated numeric display primitives.
 *
 * Inside RTL copy an unisolated "₪169" reorders — the shekel sign jumps to the
 * wrong end of the number, and a price next to Arabic text can end up reading
 * backwards. Every price, every season and every figure on this storefront
 * goes through one of these, so the isolation is structural rather than
 * something a component author has to remember.
 */

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
      ₪{value}
    </bdi>
  );
}

/** A struck-through compare-at price (previous-season products only). */
export function ComparePrice({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={cn("tabular text-ink-soft line-through", className)}>
      ₪{value}
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
