import { getTranslations } from "next-intl/server";
import { PageLede, Prose, ProseHeading, Wrap } from "./PageLede";

/**
 * Shared renderer for the mandatory legal pages. Structure lives here; ALL
 * copy lives in src/i18n/messages/ under the "privacy" / "terms" namespaces.
 * whitespace-pre-line renders the multi-paragraph bodies (the cancellation
 * section in particular). The posted policy must match what the store
 * actually honors — confirm every change with the owner in writing.
 *
 * Owner correction 2026-10-31 (Part 3 — site-wide design pass): rebuilt on
 * the same Wrap/PageLede/Prose shell every other page already uses (about,
 * shipping, size-guide). These were the one pair of pages still on a bespoke
 * layout — their own max-w-2xl article, fixed text-3xl/text-xl headings, no
 * mono-eyebrow breadcrumb — which is why they read as slightly off from the
 * rest of the site. Content, section order and wording are untouched; only
 * the shell changed. A local paragraph (not the shared ProseParagraph) keeps
 * the whitespace-pre-line + leading-relaxed treatment the multi-paragraph
 * bodies (the cancellation section especially) depend on.
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
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")}>
        <p className="mt-3 text-[13px] text-ink-soft">{t("updated")}</p>
      </PageLede>
      <Prose>
        {sections.map((section) => (
          <section key={section}>
            <ProseHeading>{t(`sections.${section}.title`)}</ProseHeading>
            <p className="mb-3.5 whitespace-pre-line leading-relaxed text-ink-soft">
              {t(`sections.${section}.body`)}
            </p>
          </section>
        ))}
      </Prose>
    </Wrap>
  );
}
