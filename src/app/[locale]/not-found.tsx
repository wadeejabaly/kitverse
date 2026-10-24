import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Branded 404 — a 404 is a brand moment, not a framework default. Reached via
 * the [...rest] catch-all's notFound(), so it renders inside the locale layout
 * with the correct lang/dir, footer and consent banner. Copy from messages.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");

  return (
    <section className="mx-auto flex w-full max-w-page grow flex-col justify-center gap-6 px-6 py-24">
      <p className="mono-eyebrow tabular text-ink-soft">404</p>
      <h1 className="text-3xl leading-tight sm:text-4xl">{t("title")}</h1>
      <p className="max-w-xl leading-relaxed text-ink-soft">{t("body")}</p>
      <Link
        href="/"
        className="self-start border border-rule px-7 py-2.5 text-sm transition-colors hover:border-ink"
      >
        {t("backHome")}
      </Link>
    </section>
  );
}
