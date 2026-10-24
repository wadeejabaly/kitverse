import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getVisibleProducts } from "@/data/catalog";
import { SearchView, type SearchEntry } from "@/components/search/SearchView";
import { Wrap } from "@/components/shared/PageLede";
import { normalizeSearch } from "@/lib/search";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/search"),
    // A search box has nothing to index and its result URLs are infinite.
    robots: { index: false, follow: true },
  };
}

/**
 * Search. The index is built here, on the server, at build time: normalising
 * 17 (later a few hundred) strings once during the build beats doing it in
 * every visitor's browser on first keystroke.
 */
export default async function SearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("search");

  const entries: SearchEntry[] = getVisibleProducts().map((product) => ({
    product,
    haystack: normalizeSearch(
      [
        product.title,
        product.titleAr,
        product.team,
        product.teamAr,
        product.season,
        product.kit,
      ].join(" "),
    ),
  }));

  return (
    <Wrap>
      {/* The lede's hairline belongs under the input, not under the title —
          SearchView draws it, so the results grid sits outside the block. */}
      <div className="pt-7">
        <span className="mono-eyebrow text-ink-soft">{t("eyebrow")}</span>
        <h1 className="mt-2 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight">
          {t("title")}
        </h1>
      </div>
      <Suspense fallback={null}>
        <SearchView entries={entries} locale={locale} />
      </Suspense>
    </Wrap>
  );
}
