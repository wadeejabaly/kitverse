import promo from "@/data/promo.json";

/**
 * The dated site-wide sale (Black Friday 2026, owner requests 2026-11-12/14/15).
 *
 * promo.json's `sale` is written from the database by `store:export` on every build (the discount
 * code's own start/end dates), so the site's look follows the code: while it runs, the home page
 * hero, the top strip and checkout switch to the Black Friday version, and they go back to the
 * normal site on their own when it ends (the strip and checkout by the shopper's clock, the home page
 * by its 5-minute revalidation - see src/app/[locale]/page.tsx). Nothing has to be undone by hand.
 *
 * Owner 2026-11-15: the sale starts NOW on the website, but the page shows a countdown to 20 Nov
 * "just for show". That date lives here, not in promo.json (which the build rewrites).
 */
export type Sale = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minOrder: number;
  startsAt: string;
  endsAt: string;
};

export const SALE: Sale | null = ((promo as { sale?: Sale }).sale ?? null);

// (The hero countdown and the top strip now count down to the sale's own end, `endsAt` - owner 2026-11-23.)

export function saleOn(now: number = Date.now(), sale: Sale | null = SALE): boolean {
  if (!sale?.startsAt || !sale?.endsAt) return false;
  return now >= Date.parse(sale.startsAt) && now < Date.parse(sale.endsAt);
}

export function saleAmount(sale: Pick<Sale, "kind" | "value">): string {
  return sale.kind === "fixed" ? `₪${sale.value}` : `${sale.value}%`;
}
