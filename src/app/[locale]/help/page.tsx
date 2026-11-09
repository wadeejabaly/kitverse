import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ADDONS, SHIPPING_ILS_BY_TIER, patchPrice, sizeSurcharge } from "@/data/pricing";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { ContactPanel, Icon, Question, type IconName } from "@/components/shared/Info";
import { NAME_NUMBER_MAX } from "@/lib/product";
import { enabledPaymentMethods } from "@/lib/payment-methods";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/help"),
  };
}

/**
 * Help Center (new in the phase-2 redesign, 2026-11-09). Six categories of
 * expandable questions. Every answer restates a policy the shop already
 * publishes — /shipping, /returns, /size-guide, /about and checkout — and
 * every figure (delivery fees, the name-and-number price, patch tiers, size
 * surcharges, the print length) is read from the price list or the code that
 * enforces it, so the answers follow admin Pricing instead of going stale.
 */
const CATEGORIES: { id: string; icon: IconName; questions: string[] }[] = [
  { id: "orders", icon: "box", questions: ["howOrder", "track", "change", "authentic"] },
  { id: "payments", icon: "card", questions: ["methods", "currency", "codes"] },
  { id: "shipping", icon: "truck", questions: ["howLong", "cost", "where", "deliveryDay"] },
  { id: "sizing", icon: "ruler", questions: ["fit", "playerFan", "bigSizes", "kids"] },
  { id: "customization", icon: "shirt", questions: ["nameNumber", "patches", "printedReturns"] },
  { id: "returns", icon: "return", questions: ["policy", "defective", "exchange"] },
];

export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("help");

  // The payment methods checkout really offers right now, in this locale.
  const pay = enabledPaymentMethods();
  const methods = [
    pay.bit ? t("methodBit") : null,
    pay.paypal ? "PayPal" : null,
    pay.cash ? t("methodCash") : null,
  ]
    .filter(Boolean)
    .join(" · ") || t("methodsCheckout");

  // Figures every answer may quote, as plain "₪…" strings.
  const values = {
    methods,
    north: `₪${SHIPPING_ILS_BY_TIER.north}`,
    rest: `₪${SHIPPING_ILS_BY_TIER.rest}`,
    nameNumber: `₪${ADDONS.nameNumber}`,
    p1: `₪${patchPrice(1)}`,
    p2: `₪${patchPrice(2)}`,
    p3: `₪${patchPrice(3)}`,
    xl3: `₪${sizeSurcharge("3XL")}`,
    xl4: `₪${sizeSurcharge("4XL")}`,
    max: String(NAME_NUMBER_MAX),
  };

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

      <div className="grid gap-8 py-10 wide:grid-cols-[240px_1fr] wide:gap-12 wide:py-14">
        {/* Category index: sticky on desktop, a scrollable chip row on a phone. */}
        <nav aria-label={t("categoriesLabel")} className="min-w-0 self-start wide:sticky wide:top-28">
          <ul className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 wide:mx-0 wide:flex-col wide:overflow-visible wide:px-0">
            {CATEGORIES.map((category) => (
              <li key={category.id} className="shrink-0">
                <a
                  href={`#${category.id}`}
                  className="flex items-center gap-3 rounded-[10px] border border-rule bg-tile px-3.5 py-2.5 text-[14px] font-semibold transition-colors hover:border-[#1f5cff] hover:text-[#1f5cff]"
                >
                  <span className="grid size-7 place-items-center text-[#1f5cff] [&_svg]:size-[18px]">
                    <Icon name={category.icon} />
                  </span>
                  {t(`categories.${category.id}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {CATEGORIES.map((category) => (
            <section key={category.id} id={category.id} className="kv-panel scroll-mt-28 px-5 pt-5 pb-2 sm:px-7 sm:pt-7">
              <h2 className="mb-2 flex items-center gap-3 text-[1.25rem] font-extrabold">
                <span className="kv-icon-tile !size-10">
                  <Icon name={category.icon} />
                </span>
                {t(`categories.${category.id}`)}
              </h2>
              {category.questions.map((question, index) => (
                <Question
                  key={question}
                  question={t(`q.${category.id}.${question}.q`)}
                  open={category.id === "orders" && index === 0}
                >
                  {t(`q.${category.id}.${question}.a`, values)}
                </Question>
              ))}
            </section>
          ))}

          <p className="text-[14px] text-ink-soft">
            {t.rich("seeAlso", {
              shipping: (chunks) => (
                <Link href="/shipping" className="font-semibold text-[#1f5cff] hover:underline">
                  {chunks}
                </Link>
              ),
              returns: (chunks) => (
                <Link href="/returns" className="font-semibold text-[#1f5cff] hover:underline">
                  {chunks}
                </Link>
              ),
              sizes: (chunks) => (
                <Link href="/size-guide" className="font-semibold text-[#1f5cff] hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>

          <ContactPanel
            title={t("stillTitle")}
            body={t("stillBody")}
            emailLabel={t("emailUs")}
            instagramLabel={t("dmUs")}
          />
        </div>
      </div>
    </Wrap>
  );
}
