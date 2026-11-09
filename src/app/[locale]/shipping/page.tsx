import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SHIPPING_ILS_BY_TIER } from "@/data/pricing";
import { Link } from "@/i18n/navigation";
import { Price } from "@/components/shared/Money";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { ContactPanel, Icon, InfoCard, InfoHeading } from "@/components/shared/Info";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shippingPage" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/shipping"),
  };
}

/**
 * Shipping and returns. The customer-facing summary of the policy facts —
 * the binding legal text lives on /terms, which this page does not restate or
 * contradict.
 */
export default async function ShippingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("shippingPage");

  const tHelp = await getTranslations("help");
  const steps = ["placed", "confirmed", "shipped", "courier"] as const;

  // Redesign phase 2 (2026-11-09): the same facts as before, laid out as the
  // homepage's language — three icon cards (timing, rates, delivery day), the
  // order journey as four numbered steps, then updates, the returns summary
  // (its full page is /returns now) and customs. Every sentence is the same
  // message key it was; only the steps are new copy, and they describe the
  // flow the shop already runs (order → owner confirmation → supplier →
  // courier call the day before).
  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

      <div className="flex flex-col gap-10 py-10 wide:gap-14 wide:py-14">
        <div className="grid gap-4 wide:grid-cols-3">
          <InfoCard icon="clock" title={t("timingTitle")}>
            {t("timingBody")}
          </InfoCard>
          <InfoCard icon="map" title={t("rateTitle")}>
            <p>{t("rateBody")}</p>
            {/* The two tiers come straight from pricing.ts, so this page can
                never quote a figure checkout disagrees with. Shown separately
                on purpose (owner decision 2026-10-25) so a northern customer
                never thinks everyone pays the higher fee. */}
            <ul className="mt-4 flex flex-col gap-2 text-ink">
              <li className="flex items-baseline justify-between gap-4 rounded-[10px] bg-chip px-3.5 py-2.5">
                <span className="text-[13.5px]">{t("tierNorth")}</span>
                <Price value={SHIPPING_ILS_BY_TIER.north} className="font-extrabold" />
              </li>
              <li className="flex items-baseline justify-between gap-4 rounded-[10px] bg-chip px-3.5 py-2.5">
                <span className="text-[13.5px]">{t("tierRest")}</span>
                <Price value={SHIPPING_ILS_BY_TIER.rest} className="font-extrabold" />
              </li>
            </ul>
          </InfoCard>
          <InfoCard icon="phone" title={t("trackingTitle")}>
            <p>{t("trackingBody")}</p>
            {/* /o/track lives outside the [locale] route tree (a single Arabic
                page, same as /o/[token]), so this is a plain anchor rather
                than the i18n Link. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- outside this root layout, so this is a full page load anyway */}
            <a href="/o/track" className="mt-3 inline-block font-bold text-[#1f5cff] hover:underline">
              {t("trackingCta")}
            </a>
          </InfoCard>
        </div>

        <section>
          <InfoHeading eyebrow={t("journeyEyebrow")} title={t("journeyTitle")} />
          <ol className="grid gap-4 sm:grid-cols-2 wide:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step} className="kv-panel relative flex flex-col gap-2.5 p-6">
                <span className="grid size-9 place-items-center rounded-full bg-[#1f5cff] font-extrabold text-white">
                  <span className="latin">{index + 1}</span>
                </span>
                <h3 className="text-[16px] font-extrabold">{t(`journey.${step}.title`)}</h3>
                <p className="text-[14px] leading-relaxed text-ink-soft">{t(`journey.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-4 wide:grid-cols-2">
          <div className="kv-panel flex flex-col gap-3 p-6 wide:p-8">
            <span className="kv-icon-tile">
              <Icon name="return" />
            </span>
            <h2 className="text-[18px] font-extrabold">{t("returnsTitle")}</h2>
            <p className="text-[14.5px] leading-relaxed text-ink-soft">
              {t("returnsSizeBody")} {t("returnsDefectiveBody")}
            </p>
            <Link href="/returns" className="mt-1 self-start font-bold text-[#1f5cff] hover:underline">
              {t("returnsCta")}
            </Link>
          </div>
          <div className="kv-panel flex flex-col gap-3 p-6 wide:p-8">
            <span className="kv-icon-tile">
              <Icon name="shield" />
            </span>
            <h2 className="text-[18px] font-extrabold">{t("customsTitle")}</h2>
            <p className="text-[14.5px] leading-relaxed text-ink-soft">{t("customsBody")}</p>
          </div>
        </div>

        <ContactPanel
          title={t("questionsTitle")}
          body={t("questionsBody")}
          emailLabel={tHelp("emailUs")}
          instagramLabel={tHelp("dmUs")}
        />
      </div>
    </Wrap>
  );
}
