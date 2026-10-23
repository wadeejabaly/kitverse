import localFont from "next/font/local";
import type { CSSProperties } from "react";

/**
 * Typography — Inter (Latin) + Noto Sans Arabic, self-hosted via
 * next/font/local from two files committed at src/fonts/.
 *
 * Owner decision 2026-10-23 ("I want a smoother font"), replacing the
 * earlier system-only stacks: letting each visitor's OS pick the face meant
 * the site looked noticeably plainer on anything that wasn't a Mac (Arial
 * for Latin, Segoe UI for Arabic on Windows — neither smooth).
 *
 * next/font/local, not next/font/google: the two files are vendored at
 * src/fonts/ (variable woff2s pulled once from the @fontsource-variable
 * packages — OFL-1.1, license text alongside them) rather than fetched from
 * fonts.googleapis.com at build time. Same self-hosted result — static
 * assets on our own domain, `display: "swap"` plus Next's automatic
 * fallback-metrics so there's no layout shift while they load — but the
 * build never depends on reaching Google at build time, which matters on a
 * network-restricted CI runner even though it's a non-issue on Vercel.
 *
 * Both files carry their full variable weight axis (`weight: "100 900"`).
 * The CSS VARIABLE method is used (not `.className`) so the stacks still
 * live here as plain strings for globals.css / Tailwind's @theme to consume,
 * exactly as before — only what `--stack-sans` / `--stack-arabic` resolve TO
 * changed. `FONT_CLASS_NAMES` below must be applied to <html> (next/font
 * only emits the @font-face + the CSS variable inside that className).
 *
 * The mono stack is untouched: `.mono-eyebrow` is a deliberate, tracked,
 * Latin-only, system-monospace treatment (prices, eyebrows, numerals), not
 * body text — "smoother" was never about that.
 */
export const inter = localFont({
  src: "../fonts/Inter-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export const notoSansArabic = localFont({
  src: "../fonts/NotoSansArabic-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-noto-arabic",
  display: "swap",
});

/** className to put on <html> so --font-inter / --font-noto-arabic resolve. */
export const FONT_CLASS_NAMES = `${inter.variable} ${notoSansArabic.variable}`;

/** Latin UI text — Inter first, the old system stack as fallback. */
export const SANS_STACK =
  'var(--font-inter), -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Eyebrows, meta rows, numerals — Latin only, deliberately still system monospace. */
export const MONO_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Arabic body and headings — Noto Sans Arabic first. The vendored file only
 * covers the Arabic Unicode block (no Latin glyphs), so Latin digits/prices
 * that land inside Arabic copy (always bidi-isolated per the Arabic
 * rendering rules) fall through to Inter next, keeping them just as smooth
 * instead of dropping straight to a system face; the old system stack stays
 * as the final fallback.
 */
export const ARABIC_STACK =
  'var(--font-noto-arabic), var(--font-inter), "SF Arabic", "Geeza Pro", "Noto Sans Arabic", "Segoe UI", sans-serif';

/**
 * Custom properties to spread onto <html>. Locale-independent — globals.css
 * selects the Arabic stack per `lang`, so there is nothing to switch here.
 */
export const FONT_STACK_VARS = {
  "--stack-sans": SANS_STACK,
  "--stack-mono": MONO_STACK,
  "--stack-arabic": ARABIC_STACK,
} as CSSProperties;
