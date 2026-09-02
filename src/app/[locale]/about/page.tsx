import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
  const t = await getTranslations({ locale, namespace: "about" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/about"),
  };
}

/**
 * About — short, and honest about what is being sold. These are replicas, and
 * the page says so in its second paragraph rather than leaving a customer to
 * discover it after the parcel arrives. That positioning was an explicit
 * decision, not a hedge.
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} />
      <Prose>
        <ProseParagraph>{t("body1")}</ProseParagraph>
        <ProseParagraph>{t("body2")}</ProseParagraph>
        <ProseParagraph>{t("body3")}</ProseParagraph>

        <ProseHeading>{t("contactTitle")}</ProseHeading>
        <ProseParagraph>{t("contactBody")}</ProseParagraph>
        {/* mailto: is not an http(s) URL, so it sits outside the
            getSiteUrl() rule; the address itself lives in messages. */}
        <p>
          <a
            href={`mailto:${t("email")}`}
            className="text-ink underline underline-offset-4"
          >
            <bdi dir="ltr">{t("email")}</bdi>
          </a>
        </p>
      </Prose>
    </Wrap>
  );
}
