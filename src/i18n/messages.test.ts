import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import ar from "./messages/ar.json";
import en from "./messages/en.json";
import he from "./messages/he.json";
import { routing } from "./config";

/**
 * Guards for the two pluralised messages.
 *
 * `shop.count` and `search.results` deliberately take TWO arguments: `count`
 * (a number, which drives ICU plural selection — Arabic has six categories,
 * Hebrew has four: one, two, many, other) and `countText` (a string, which
 * is what actually prints, so the numeral stays Latin instead of being
 * rendered ٤ by the Arabic number formatter).
 *
 * That split is easy to half-apply: add a `{countText}` branch to the message
 * but forget it at a call site and next-intl logs
 * `FORMATTING_ERROR: countText was not provided`, then silently falls back to
 * printing the key path. These tests format every plural branch in every
 * locale and fail on ANY formatting error, so the halves can never drift
 * apart again.
 */

const MESSAGES = { ar, en, he } as const;
type MessagesLocale = keyof typeof MESSAGES;

/** RTL locales that bake raw "₪NN" amounts into prose (see the bidi test below). */
const RTL_MESSAGE_LOCALES = ["ar", "he"] as const;

/** Counts that hit all six ICU categories: zero, one, two, few, many, other. */
const COUNTS = [0, 1, 2, 3, 6, 17, 101];

const ARABIC_INDIC = /[٠-٩]/;

function translatorFor(locale: MessagesLocale, namespace: "shop" | "search") {
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
        // 17 lands in a branch that displays the figure in every locale
        // (en: "other", ar: "many", he: "other").
        expect(tShop("count", { count: 17, countText: "17" })).toContain("17");
        expect(
          tSearch("results", { count: 17, countText: "17", query: "q" }),
        ).toContain("17");
      });
    });
  }

  /**
   * "₪19" inside Arabic or Hebrew prose renders as "19₪" without help.
   *
   * The shekel sign is bidi class ET and the digits are EN; left alone in an
   * RTL paragraph the currency sign can end up on the wrong side of its own
   * number (the precise mechanism differs — Arabic's AL letters trigger
   * Unicode bidi rule W2 to retype the digits as AN; Hebrew's R letters
   * don't — but the visible bug is the same for both scripts, so both get
   * the same fix).
   *
   * So every amount baked into an Arabic or Hebrew string carries an
   * explicit isolate: U+2066 LRI … U+2069 PDI. (Components render amounts
   * through <Price>, which supplies <bdi dir="ltr"> instead — the same fix
   * in markup. This guard covers the strings, which have no markup to lean
   * on.) English is unaffected: in an LTR paragraph the ET/EN fusion happens
   * normally.
   */
  it.each(RTL_MESSAGE_LOCALES)("bidi-isolates every shekel amount embedded in %s strings", (locale) => {
    const LRI = "⁦";
    const PDI = "⁩";
    // Owner decision 2026-10-23 introduced the site's first fractional ILS
    // prices (₪11.99 patch, ₪34.99 gift box), so the amount a regex must
    // swallow whole — digits, then an optional ".NN" — or it stops matching
    // partway through and flags the isolate as missing after the decimal.
    const AMOUNT = /\+?₪\d+(?:\.\d+)?/g;

    const strings = (value: unknown, prefix = ""): [string, string][] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) =>
            strings(child, prefix ? `${prefix}.${key}` : key),
          )
        : typeof value === "string"
          ? [[prefix, value]]
          : [];

    const offenders: string[] = [];
    for (const [key, text] of strings(MESSAGES[locale])) {
      if (!text.includes("₪")) continue;
      for (const match of text.matchAll(AMOUNT)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (text[start - 1] !== LRI || text[end] !== PDI) {
          offenders.push(`${key}: ${match[0]}`);
        }
      }
    }

    expect(
      offenders,
      `${locale} amounts must be wrapped in U+2066 … U+2069`,
    ).toEqual([]);

    // The guard is only meaningful if it is actually looking at something.
    const withAmounts = strings(MESSAGES[locale]).filter(([, text]) => text.includes("₪"));
    expect(withAmounts.length).toBeGreaterThan(0);
  });

  it("keeps the ar, en and he message keysets identical", () => {
    const paths = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([key, child]) =>
            paths(child, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix];

    const arPaths = paths(ar).sort();
    expect(paths(en).sort()).toEqual(arPaths);
    expect(paths(he).sort()).toEqual(arPaths);
  });
});
