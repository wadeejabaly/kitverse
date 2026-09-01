import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Home — a quiet stand-in until wave 2 composes the real storefront sections
 * (featured kits, leagues, the Fan vs Player explainer). All copy comes from
 * src/i18n/messages/, never inline.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <section className="mx-auto flex w-full max-w-page grow flex-col justify-center gap-6 px-6 py-24">
      <p className="mono-eyebrow text-ink-soft">{t("eyebrow")}</p>
      <h1 className="max-w-2xl text-4xl leading-tight sm:text-5xl">
        {t("title")}
      </h1>
      <p className="max-w-xl leading-relaxed text-ink-soft">{t("intro")}</p>
    </section>
  );
}
