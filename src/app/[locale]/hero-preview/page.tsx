import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HeroA } from "@/components/hero/HeroA";
import { HeroB } from "@/components/hero/HeroB";
import { HeroC } from "@/components/hero/HeroC";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "heroPreview" });
  return {
    title: t("pageTitle"),
    // An internal comparison page. It is linked from nowhere, it is absent
    // from the sitemap, and it must never be indexed or crawled onward — the
    // three headlines here would otherwise compete with the real home page for
    // the same terms.
    robots: { index: false, follow: false },
  };
}

/**
 * Hero variants — an internal comparison page, not part of the storefront.
 *
 * Three complete, production-quality openings for the home page, stacked one
 * viewport each and separated by the site's one hairline. Each is the real
 * component from src/components/hero/, rendered exactly as it would render at
 * the top of the home page, so whichever one is chosen moves across unchanged.
 *
 * Only Variant A gets `priority` on its imagery: on this page it is the one
 * hero actually in the first viewport, and marking all three would have the
 * browser fight itself over the LCP. On the home page the winner would carry
 * it instead.
 */
export default async function HeroPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("heroPreview");

  return (
    <>
      <div className="mx-auto flex w-full max-w-page flex-wrap items-baseline gap-x-4 gap-y-1 px-6 pt-6 pb-5">
        <span className="mono-eyebrow">{t("pageLabel")}</span>
        <span className="text-sm text-ink-soft">{t("pageNote")}</span>
      </div>

      <Variant tag={t("a.tag")} name={t("a.name")}>
        <HeroA locale={locale} priority />
      </Variant>

      <Variant tag={t("b.tag")} name={t("b.name")}>
        <HeroB />
      </Variant>

      <Variant tag={t("c.tag")} name={t("c.name")}>
        <HeroC locale={locale} />
      </Variant>
    </>
  );
}

/**
 * One labelled slot: a hairline above, and a corner tag pinned to the top
 * inline-start of the section.
 *
 * The letter keeps the Latin mono treatment in both locales (`.latin`) — it is
 * an index, like the footer's logotype, not a word. The variant's name beside
 * it is copy and reads in the page's own language. z-10 puts the tag over
 * Variant B's full-bleed wall.
 */
function Variant({
  tag,
  name,
  children,
}: {
  tag: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative border-t border-rule">
      <div className="pointer-events-none absolute top-4 start-6 z-10 flex items-baseline gap-2.5">
        <span className="mono-eyebrow latin text-ink-soft">{tag}</span>
        <span className="text-[11px] text-ink-soft">{name}</span>
      </div>
      {children}
    </div>
  );
}
