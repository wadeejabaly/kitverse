import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SHIPPING_ILS_DOMESTIC } from "@/data/pricing";
import { Price } from "@/components/shared/Money";
import {
  PageLede,
  Prose,
  ProseHeading,
  ProseParagraph,
  Wrap,
} from "@/components/shared/PageLede";
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

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} />
      <Prose>
        <ProseHeading>{t("timingTitle")}</ProseHeading>
        <ProseParagraph>{t("timingBody")}</ProseParagraph>

        <ProseHeading>{t("rateTitle")}</ProseHeading>
        <ProseParagraph>{t("rateBody")}</ProseParagraph>
        {/* The rate itself comes from pricing.ts, so this page can never
            quote a figure the cart disagrees with. */}
        <p className="mb-3.5 text-ink">
          <Price value={SHIPPING_ILS_DOMESTIC} />
        </p>

        <ProseHeading>{t("trackingTitle")}</ProseHeading>
        <ProseParagraph>{t("trackingBody")}</ProseParagraph>

        <ProseHeading>{t("returnsTitle")}</ProseHeading>
        <ProseParagraph>{t("returnsBody")}</ProseParagraph>

        <ProseHeading>{t("customsTitle")}</ProseHeading>
        <ProseParagraph>{t("customsBody")}</ProseParagraph>
      </Prose>
    </Wrap>
  );
}
