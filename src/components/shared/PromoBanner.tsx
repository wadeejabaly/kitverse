import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import promo from "@/data/promo.json";
import { PromoSwitch } from "@/components/shared/PromoSwitch";
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
 *
 * Dated sale codes (owner request 2026-11-12, Black Friday): promo.json's `sale` is a code for everyone
 * with start + end dates; between them the navy sale strip replaces the welcome offer, chosen by the
 * shopper's clock in PromoSwitch so it starts and stops on time without a deploy.
 */
type Code = { code: string; kind: "percent" | "fixed"; value: number; minOrder: number };
type Sale = Code & { startsAt: string; endsAt: string };
const data = promo as { welcome?: Code; sale?: Sale };
const welcome = data.welcome;
const sale = data.sale;
/** The static page is built once; which strip it starts with is decided as of the build. */
const builtAt = Date.now();

const strong = (chunks: React.ReactNode) => (
  <strong dir="ltr" className="latin tracking-wide">
    {chunks}
  </strong>
);

export async function PromoBanner() {
  const cash = enabledPaymentMethods().cash;
  if (!welcome && !sale && !cash) return null;
  const t = await getTranslations("promo");
  const amountOf = (c: Code) => (c.kind === "fixed" ? `₪${c.value}` : `${c.value}%`);

  const cashNote = cash ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-bold">
      <CashIcon className="h-[1.15em] w-[1.15em] shrink-0" />
      {t("cash")}
    </span>
  ) : null;
  // the "Shop now" link text is dropped on phones so the strip stays short; the whole strip is the link
  const cta = (
    <>
      <span className="mx-2 hidden opacity-70 sm:inline">·</span>
      <span className="hidden underline underline-offset-2 sm:inline">{t("cta")}</span>
    </>
  );

  const welcomeStrip = welcome || cash ? (
    <Link
      href="/shop"
      // data-kv-chrome: measured and hidden by the home page video hero (HeroVideo.tsx).
      // relative z-40: painted above that hero, which slides up underneath it.
      data-kv-chrome
      className="relative z-40 block border-b border-rule bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
    >
      {cashNote}
      {cash && welcome ? <span className="mx-2 opacity-70">·</span> : null}
      {!welcome
        ? null
        : welcome.minOrder > 0
          ? t.rich("welcome", { amount: amountOf(welcome), min: `₪${welcome.minOrder}`, code: welcome.code, c: strong })
          : t.rich("welcomeNoMin", { amount: amountOf(welcome), code: welcome.code, c: strong })}
      {cta}
    </Link>
  ) : null;

  if (!sale) return welcomeStrip;

  const saleStrip = (
    <Link
      href="/shop"
      data-kv-chrome
      className="relative z-40 block border-b border-[#2f6bff]/40 bg-[#05081a] px-4 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
    >
      <span className="latin me-2 font-extrabold tracking-[0.12em] text-[#7fa6ff]">BLACK FRIDAY</span>
      {t.rich("sale", { amount: amountOf(sale), code: sale.code, c: strong })}
      {cash ? <span className="mx-2 opacity-60">·</span> : null}
      {cashNote}
      {cta}
    </Link>
  );

  return (
    <PromoSwitch
      welcome={welcomeStrip}
      sale={saleStrip}
      startsAt={sale.startsAt}
      endsAt={sale.endsAt}
      saleAtBuild={builtAt >= Date.parse(sale.startsAt) && builtAt < Date.parse(sale.endsAt)}
    />
  );
}
