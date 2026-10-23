import localFont from "next/font/local";
import type { CSSProperties } from "react";

/**
 * Typography — Cairo, self-hosted via next/font/local from two files
 * committed at src/fonts/.
 *
 * Owner decision 2026-10-23 ("make the font in the website cairo"),
 * replacing the Inter + Noto Sans Arabic pairing from earlier the same day
 * ("I want a smoother font") with the one typeface the owner asked for by
 * name. Cairo is designed to cover both scripts, but Google ships it (via
 * @fontsource-variable/cairo) as separate per-subset variable files rather
 * than one file with both — so this is still two next/font/local calls, the
 * same shape as the Inter/Noto pairing it replaces, just both halves now
 * named Cairo.
 *
 * next/font/local, not next/font/google: same reasoning as before — the two
 * files are vendored at src/fonts/ (pulled once from
 * @fontsource-variable/cairo — OFL-1.1, license text alongside them) rather
 * than fetched from fonts.googleapis.com at build time, so the build never
 * depends on reaching Google at build time (a non-issue on Vercel, but it
 * matters on a network-restricted CI runner).
 *
 * Cairo's variable weight axis is 200–1000, not Inter's 100–900 — there is
 * no literal font-weight below 200 anywhere in this codebase (checked), so
 * nothing clamps.
 *
 * The CSS VARIABLE method is used (not `.className`) so the stacks still
 * live here as plain strings for globals.css / Tailwind's @theme to consume
 * — only what `--stack-sans` / `--stack-arabic` resolve TO changed.
 * `FONT_CLASS_NAMES` below must be applied to <html> (next/font only emits
 * the @font-face + the CSS variable inside that className).
 *
 * The mono stack is untouched: `.mono-eyebrow` is a deliberate, tracked,
 * Latin-only, system-monospace treatment (prices, eyebrows, numerals), not
 * body text — neither the Inter/Noto decision nor this one ever touched it.
 */
export const cairoLatin = localFont({
  src: "../fonts/Cairo-Latin-Variable.woff2",
  weight: "200 1000",
  style: "normal",
  variable: "--font-cairo-latin",
  display: "swap",
});

export const cairoArabic = localFont({
  src: "../fonts/Cairo-Arabic-Variable.woff2",
  weight: "200 1000",
  style: "normal",
  variable: "--font-cairo-arabic",
  display: "swap",
});

/** className to put on <html> so --font-cairo-latin / --font-cairo-arabic resolve. */
export const FONT_CLASS_NAMES = `${cairoLatin.variable} ${cairoArabic.variable}`;

/** Latin UI text — Cairo first, the old system stack as fallback. */
export const SANS_STACK =
  'var(--font-cairo-latin), -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Eyebrows, meta rows, numerals — Latin only, deliberately still system monospace. */
export const MONO_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Arabic body and headings — Cairo's Arabic subset first. That file only
 * covers the Arabic Unicode block (no Latin glyphs — verified against the
 * fontsource package's unicode.json), so Latin digits/prices that land
 * inside Arabic copy (always bidi-isolated per the Arabic rendering rules)
 * fall through to Cairo's Latin subset next, keeping them in the same
 * typeface instead of dropping straight to a system face; the old system
 * stack stays as the final fallback.
 */
export const ARABIC_STACK =
  'var(--font-cairo-arabic), var(--font-cairo-latin), "SF Arabic", "Geeza Pro", "Noto Sans Arabic", "Segoe UI", sans-serif';

/**
 * Custom properties to spread onto <html>. Locale-independent — globals.css
 * selects the Arabic stack per `lang`, so there is nothing to switch here.
 */
export const FONT_STACK_VARS = {
  "--stack-sans": SANS_STACK,
  "--stack-mono": MONO_STACK,
  "--stack-arabic": ARABIC_STACK,
} as CSSProperties;
