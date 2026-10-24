"use client";

import { useTranslations } from "next-intl";

/**
 * Branded error boundary — a failure is a brand moment, not a framework
 * default. Quiet type on the token palette; copy from messages.
 */
export default function LocaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  return (
    <section className="mx-auto flex w-full max-w-page grow flex-col justify-center gap-6 px-6 py-24">
      <p className="mono-eyebrow tabular text-ink-soft">500</p>
      <h1 className="text-3xl leading-tight sm:text-4xl">{t("title")}</h1>
      <p className="max-w-xl leading-relaxed text-ink-soft">{t("body")}</p>
      <button
        type="button"
        onClick={reset}
        className="self-start border border-rule px-7 py-2.5 text-sm transition-colors hover:border-ink"
      >
        {t("retry")}
      </button>
    </section>
  );
}
