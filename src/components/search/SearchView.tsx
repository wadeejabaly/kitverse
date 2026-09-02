"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Product } from "@/data/types";
import { ProductGrid } from "@/components/shop/ProductCard";
import { normalizeSearch } from "@/lib/search";

export interface SearchEntry {
  product: Product;
  /** Pre-normalised EN + AR title and team, joined — built on the server. */
  haystack: string;
}

/**
 * Instant search over the approved catalogue.
 *
 * The whole index ships with the page and filtering happens on keystroke:
 * there is no request, so results appear as fast as the reader types, and the
 * corpus is small because only approved products are searchable. Both
 * languages are always in the haystack — someone browsing the Arabic site can
 * still type "Bayern", and someone on the English site can type بايرن.
 *
 * useSearchParams is why the page wraps this in <Suspense>: it opts the
 * component into client-side rendering of the query string.
 */
export function SearchView({
  entries,
  locale,
}: {
  entries: SearchEntry[];
  locale: string;
}) {
  const t = useTranslations("search");
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const normalized = normalizeSearch(query);
  const results = useMemo(() => {
    if (normalized === "") return [];
    // Every whitespace-separated term must appear: "brazil away" narrows
    // rather than widening, which is what people expect from two words.
    const terms = normalized.split(/\s+/).filter(Boolean);
    return entries
      .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
      .map((entry) => entry.product);
  }, [entries, normalized]);

  return (
    <>
      <div className="border-b border-rule pb-8">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("label")}
          autoComplete="off"
          className="mt-4 w-full max-w-[460px] border border-rule bg-tile px-3.5 py-3 text-sm text-ink"
        />
      </div>

      <div className="mt-7 mb-6 flex items-baseline justify-between gap-4 border-b border-rule pb-4">
        <span className="mono-eyebrow text-ink-soft" aria-live="polite">
          {normalized === ""
            ? t("prompt")
            : t("results", {
                // count drives ICU plural selection (Arabic has six forms);
                // countText is what actually prints, as a string, so the
                // numeral stays Latin in every locale.
                count: results.length,
                countText: String(results.length),
                query,
              })}
        </span>
      </div>

      {results.length > 0 ? (
        <div className="pb-14">
          <ProductGrid products={results} locale={locale} />
        </div>
      ) : normalized === "" ? null : (
        <p className="max-w-[46ch] pb-14 text-ink-soft">{t("empty", { query })}</p>
      )}
    </>
  );
}
