import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { alternatesFor } from "@/lib/site";
import { LegalPage } from "@/components/shared/LegalPage";

/**
 * Terms of use — MANDATORY, the store cannot launch without it. Copy lives in
 * src/i18n/messages/ under "terms". The cancellation section carries the
 * 14-day distance-transaction right, the refund timeline and the 5% / 100 ₪
 * fee cap, and MUST be linked from the checkout page. The posted policy has to
 * match what the store actually honors — confirmed with the owner in writing.
 */

const SECTIONS = [
  "use",
  "prices",
  "payment",
  "delivery",
  "cancellation",
  "warranty",
  "contact",
  "law",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  return {
    title: t("title"),
    alternates: alternatesFor(locale, "/terms"),
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage namespace="terms" sections={SECTIONS} />;
}
