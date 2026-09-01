import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import ar from "./messages/ar.json";
import en from "./messages/en.json";
import { routing } from "./config";

/**
 * Guards for the two pluralised messages.
 *
 * `shop.count` and `search.results` deliberately take TWO arguments: `count`
 * (a number, which drives ICU plural selection — Arabic has six categories)
 * and `countText` (a string, which is what actually prints, so the numeral
 * stays Latin instead of being rendered ٤ by the Arabic number formatter).
 *
 * That split is easy to half-apply: add a `{countText}` branch to the message
 * but forget it at a call site and next-intl logs
 * `FORMATTING_ERROR: countText was not provided`, then silently falls back to
 * printing the key path. These tests format every plural branch in both
 * locales and fail on ANY formatting error, so the two halves can never drift
 * apart again.
 */

const MESSAGES = { ar, en } as const;

/** Counts that hit all six ICU categories: zero, one, two, few, many, other. */
const COUNTS = [0, 1, 2, 3, 6, 17, 101];

const ARABIC_INDIC = /[٠-٩]/;

function translatorFor(locale: "ar" | "en", namespace: "shop" | "search") {
  const errors: string[] = [];
  const t = createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace,
    onError: (error) => errors.push(String(error)),
  });
  return { t, errors };
}

describe("pluralised count messages", () => {
  for (const locale of routing.locales) {
    describe(locale, () => {
      it("formats shop.count for every plural branch without error", () => {
        const { t, errors } = translatorFor(locale, "shop");
        for (const count of COUNTS) {
          const result = t("count", { count, countText: String(count) });
          expect(errors, `count=${count} logged a formatting error`).toEqual([]);
          expect(result).not.toBe("");
          // next-intl falls back to the key path when formatting fails.
          expect(result).not.toContain("shop.count");
          expect(result).not.toMatch(ARABIC_INDIC);
        }
      });

      it("formats search.results for every plural branch without error", () => {
        const { t, errors } = translatorFor(locale, "search");
        for (const count of COUNTS) {
          const result = t("results", {
            count,
            countText: String(count),
            query: "arsenal",
          });
          expect(errors, `count=${count} logged a formatting error`).toEqual([]);
          expect(result).not.toBe("");
          expect(result).not.toContain("search.results");
          expect(result).toContain("arsenal");
          expect(result).not.toMatch(ARABIC_INDIC);
        }
      });

      it("prints the Latin numeral wherever a branch shows one", () => {
        const { t: tShop } = translatorFor(locale, "shop");
        const { t: tSearch } = translatorFor(locale, "search");
        // 17 lands in a branch that displays the figure in both locales
        // (en: "other", ar: "many").
        expect(tShop("count", { count: 17, countText: "17" })).toContain("17");
        expect(
          tSearch("results", { count: 17, countText: "17", query: "q" }),
        ).toContain("17");
      });
    });
  }

  it("keeps ar and en message keysets identical", () => {
    const paths = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) =>
            paths(child, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix];

    expect(paths(ar).sort()).toEqual(paths(en).sort());
  });
});
