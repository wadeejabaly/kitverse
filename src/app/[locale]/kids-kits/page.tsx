import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KitListing } from "@/components/kits/KitListing";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "kits" });
  return { title: t("kidsTitle"), description: t("kidsIntro"), alternates: alternatesFor(locale, "/kids-kits") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <KitListing locale={locale} set="kids_kit" />;
}
