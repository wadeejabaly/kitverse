import { getTranslations } from "next-intl/server";

/**
 * Shared renderer for the mandatory legal pages. Structure lives here; ALL
 * copy lives in src/i18n/messages/ under the "privacy" / "terms" namespaces.
 * whitespace-pre-line renders the multi-paragraph bodies (the cancellation
 * section in particular). The posted policy must match what the store
 * actually honors — confirm every change with the owner in writing.
 */
export async function LegalPage({
  namespace,
  sections,
}: {
  namespace: "privacy" | "terms";
  sections: readonly string[];
}) {
  const t = await getTranslations(namespace);

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-20">
      <h1 className="text-3xl leading-tight sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 text-sm text-ink-soft">{t("updated")}</p>
      <p className="mt-8 leading-relaxed">{t("intro")}</p>
      {sections.map((section) => (
        <section key={section} className="mt-10">
          <h2 className="text-xl">{t(`sections.${section}.title`)}</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-soft">
            {t(`sections.${section}.body`)}
          </p>
        </section>
      ))}
    </article>
  );
}
