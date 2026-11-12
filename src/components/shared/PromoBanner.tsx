import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import promo from "@/data/promo.json";
import { enabledPaymentMethods } from "@/lib/payment-methods";
import { CashIcon } from "./CashIcon";

/**
 * Site-wide strip for the first-order welcome code (owner request
 * 2026-11-10: "remove the promotion from the website and make it 30 shekels
 * off your first order from 300 ILS" — the old "3 player shirts for 300"
 * strip is gone and its `bundle_3` offer is switched off in the price list).
 *
 * Everything shown comes from src/data/promo.json, which
 * scripts/export-store-catalog.ts writes on every build from the newest
 * ACTIVE first-order-only code in admin Discounts — so the amount, minimum
 * and code on the strip are always the code the checkout will actually
 * accept, and pausing the code in admin removes the strip on the next build.
 * The rule itself (first order per phone, minimum order) is enforced only at
 * checkout, in src/lib/orders/web.ts.
 *
 * It also leads with "Pay cash on delivery" (owner request 2026-11-12: every
 * visitor should know straight away that they can pay cash) - shown whenever
 * checkout really offers cash (same test as checkout, src/lib/payment-methods.ts),
 * with or without a welcome code.
 */
type Welcome = { code: string; kind: "percent" | "fixed"; value: number; minOrder: number };
const welcome = (promo as { welcome?: Welcome }).welcome;

export async function PromoBanner() {
  const cash = enabledPaymentMethods().cash;
  if (!welcome && !cash) return null;
  const t = await getTranslations("promo");
  const amount = welcome ? (welcome.kind === "fixed" ? `₪${welcome.value}` : `${welcome.value}%`) : "";

  return (
    <Link
      href="/shop"
      // data-kv-chrome: measured and hidden by the home page video hero (HeroVideo.tsx).
      // relative z-40: painted above that hero, which slides up underneath it.
      data-kv-chrome
      className="relative z-40 block border-b border-rule bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
    >
      {cash ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-bold">
          <CashIcon className="h-[1.15em] w-[1.15em] shrink-0" />
          {t("cash")}
        </span>
      ) : null}
      {cash && welcome ? <span className="mx-2 opacity-70">·</span> : null}
      {!welcome ? null : welcome.minOrder > 0
        ? t.rich("welcome", {
            amount,
            min: `₪${welcome.minOrder}`,
            code: welcome.code,
            c: (chunks) => (
              <strong dir="ltr" className="latin tracking-wide">
                {chunks}
              </strong>
            ),
          })
        : t.rich("welcomeNoMin", {
            amount,
            code: welcome.code,
            c: (chunks) => (
              <strong dir="ltr" className="latin tracking-wide">
                {chunks}
              </strong>
            ),
          })}
      {/* the "Shop now" link text is dropped on phones so the strip stays short; the whole strip is the link */}
      <span className="mx-2 hidden opacity-70 sm:inline">·</span>
      <span className="hidden underline underline-offset-2 sm:inline">{t("cta")}</span>
    </Link>
  );
}
