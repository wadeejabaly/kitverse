import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { alternatesFor } from "@/lib/site";
import { LegalPage } from "@/components/shared/LegalPage";

/**
 * Privacy policy — MANDATORY, the store cannot launch without it. Copy lives
 * in src/i18n/messages/ under "privacy": what is collected, why, which
 * processors see it, retention, access/deletion, analytics. The processor list
 * must name the ones this build actually uses — keep it in step with reality.
 */

const SECTIONS = [
  "collect",
  "use",
  "processors",
  "retention",
  "rights",
  "analytics",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return {
    title: t("title"),
    alternates: alternatesFor(locale, "/privacy"),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage namespace="privacy" sections={SECTIONS} />;
}
