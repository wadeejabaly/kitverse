import type { CSSProperties } from "react";

/**
 * Typography stacks — system fonts only, no webfont is loaded.
 *
 * This is a deliberate decision, not a placeholder: the design is a
 * Helvetica-style system sans, and every target platform already ships a good
 * Arabic face. Zero font bytes, zero FOUT, and Arabic renders in the face the
 * reader's OS already uses everywhere else.
 *
 * These stacks are the single source of truth. They are applied to <html> as
 * CSS custom properties in src/app/[locale]/layout.tsx; globals.css consumes
 * them via --type-sans / --type-mono / --type-arabic.
 *
 * Rule that travels with them: the mono stack carries the tracked, uppercase
 * eyebrow treatment and is LATIN ONLY. Arabic is never letter-spaced and never
 * uppercased — see the [lang="ar"] block in globals.css.
 */

/** Latin UI text. */
export const SANS_STACK =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Eyebrows, meta rows, numerals — Latin only. */
export const MONO_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/** Arabic body and headings. */
export const ARABIC_STACK =
  '"SF Arabic", "Geeza Pro", "Noto Sans Arabic", "Segoe UI", sans-serif';

/**
 * Custom properties to spread onto <html>. Locale-independent — globals.css
 * selects the Arabic stack per `lang`, so there is nothing to switch here.
 */
export const FONT_STACK_VARS = {
  "--stack-sans": SANS_STACK,
  "--stack-mono": MONO_STACK,
  "--stack-arabic": ARABIC_STACK,
} as CSSProperties;
