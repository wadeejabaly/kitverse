/**
 * A league's or team's display name in the page's locale. Hebrew had its own
 * `nameHe` in collections.json all along, but most call sites only branched
 * on Arabic, so /he showed English league and team names (fixed in the
 * phase-2 redesign, 2026-11-09).
 */
export function localName(
  entry: { name: string; nameAr: string; nameHe: string },
  locale: string,
): string {
  if (locale === "ar") return entry.nameAr;
  if (locale === "he") return entry.nameHe || entry.name;
  return entry.name;
}
