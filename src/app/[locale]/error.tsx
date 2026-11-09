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
    <section className="mx-auto flex w-full max-w-page grow flex-col justify-center gap-5 px-6 py-24">
      <p className="latin text-[clamp(3rem,9vw,6rem)] leading-none font-extrabold text-[#1f5cff]">500</p>
      <h1 className="text-[clamp(1.8rem,3.6vw,2.8rem)] leading-tight font-extrabold">{t("title")}</h1>
      <p className="max-w-xl leading-relaxed text-ink-soft">{t("body")}</p>
      <button type="button" onClick={reset} className="btn mt-2 self-start">
        {t("retry")}
      </button>
    </section>
  );
}
