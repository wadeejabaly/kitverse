import localFont from "next/font/local";
import type { CSSProperties } from "react";

/**
 * Typography — two typefaces, both self-hosted via next/font/local from
 * files committed at src/fonts/.
 *
 * Owner decision 2026-10-25 ("modern, heavily stylized geometric Arabic
 * typefaces"), replacing the single Cairo pairing from 2026-10-23. The
 * owner's first ask named Trade Gothic + Futura Bold specifically — both
 * commercial (Monotype/Bauer) typefaces with no Arabic cut and no license
 * held here, so self-hosting them the way Cairo was vendored would have
 * meant distributing unlicensed font files, and neither covers the Arabic
 * the storefront defaults to. The owner dropped that ask in favour of this
 * one once that was explained.
 *
 *   - PRIMARY — Changa. A geometric sans with a genuinely wide weight axis
 *     (200–800), legible at UI/body sizes as well as headline scale, so it
 *     carries nav, prices, copy and everything that isn't a major heading.
 *   - DISPLAY — Reem Kufi. A bold, blocky, Kufic-geometric face — the
 *     "heavily stylized" half of the pairing — reserved for the handful of
 *     big headline moments (h1/h2 and the two display classes below) rather
 *     than applied everywhere, the same way Futura Bold was asked to cover
 *     "major headers" only and not body copy.
 *
 * Both are Google Fonts (OFL-1.1, license text alongside each pair below),
 * pulled once from @fontsource-variable/changa and @fontsource-variable/
 * reem-kufi, and both ship a genuine Arabic cut with its own Latin subset —
 * same two-file-per-typeface shape the Cairo pairing used, just four files
 * now instead of two.
 *
 * next/font/local, not next/font/google: same reasoning as the Cairo setup
 * it replaces — the files are vendored at src/fonts/ rather than fetched
 * from fonts.googleapis.com at build time, so the build never depends on
 * reaching Google at build time (a non-issue on Vercel, but it matters on a
 * network-restricted CI runner).
 *
 * The CSS VARIABLE method is used (not `.className`) so the stacks still
 * live here as plain strings for globals.css / Tailwind's @theme to consume
 * — only what the `--stack-*` variables resolve TO changed.
 * `FONT_CLASS_NAMES` below must be applied to <html> (next/font only emits
 * the @font-face + the CSS variable inside that className).
 *
 * The mono stack is untouched: `.mono-eyebrow` is a deliberate, tracked,
 * Latin-only, system-monospace treatment (prices, eyebrows, numerals), not
 * body or heading text — none of these typeface decisions have ever
 * touched it.
 */
export const changaLatin = localFont({
  src: "../fonts/Changa-Latin-Variable.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-changa-latin",
  display: "swap",
});

export const changaArabic = localFont({
  src: "../fonts/Changa-Arabic-Variable.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-changa-arabic",
  display: "swap",
});

export const reemKufiLatin = localFont({
  src: "../fonts/ReemKufi-Latin-Variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-reem-kufi-latin",
  display: "swap",
});

export const reemKufiArabic = localFont({
  src: "../fonts/ReemKufi-Arabic-Variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-reem-kufi-arabic",
  display: "swap",
});

/** className to put on <html> so every --font-* custom property below resolves. */
export const FONT_CLASS_NAMES = `${changaLatin.variable} ${changaArabic.variable} ${reemKufiLatin.variable} ${reemKufiArabic.variable}`;

/** Latin UI text and body copy — Changa first, the old system stack as fallback. */
export const SANS_STACK =
  'var(--font-changa-latin), -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Eyebrows, meta rows, numerals — Latin only, deliberately still system monospace. */
export const MONO_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Arabic body and UI copy — Changa's Arabic subset first. That file only
 * covers the Arabic Unicode block (no Latin glyphs), so Latin digits/prices
 * that land inside Arabic copy (always bidi-isolated per the Arabic
 * rendering rules) fall through to Changa's Latin subset next, keeping them
 * in the same typeface instead of dropping straight to a system face; the
 * old system stack stays as the final fallback.
 */
export const ARABIC_STACK =
  'var(--font-changa-arabic), var(--font-changa-latin), "SF Arabic", "Geeza Pro", "Noto Sans Arabic", "Segoe UI", sans-serif';

/**
 * Major headers only — h1/h2 and the two display classes (see globals.css'
 * "major headers" block). Reem Kufi first, falling back to the primary
 * Changa stack rather than straight to system sans, so a reader without the
 * display font still lands on the next-most-deliberate choice.
 */
export const SANS_DISPLAY_STACK = `var(--font-reem-kufi-latin), ${SANS_STACK}`;

/** Same idea, Arabic-first — see ARABIC_STACK's own note on the Latin fallback step. */
export const ARABIC_DISPLAY_STACK = `var(--font-reem-kufi-arabic), var(--font-reem-kufi-latin), ${ARABIC_STACK}`;

/**
 * Custom properties to spread onto <html>. Locale-independent — globals.css
 * selects the Arabic stacks per `lang`, so there is nothing to switch here.
 */
export const FONT_STACK_VARS = {
  "--stack-sans": SANS_STACK,
  "--stack-mono": MONO_STACK,
  "--stack-arabic": ARABIC_STACK,
  "--stack-sans-display": SANS_DISPLAY_STACK,
  "--stack-arabic-display": ARABIC_DISPLAY_STACK,
} as CSSProperties;
