/**
 * Search normalisation, shared by the index builder and the query box so the
 * two can never disagree.
 *
 * Latin side: case-folded, diacritics stripped — "atletico" finds "Atlético".
 * Arabic side: harakat and tatweel removed, and the letters readers type
 * interchangeably are folded together (أ/إ/آ → ا, ة → ه, ى → ي). Without that
 * folding, "المانيا" would miss "ألمانيا" — which is how most people type it.
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Latin combining marks
    .replace(/[ً-ْٰ]/g, "") // Arabic harakat
    .replace(/ـ/g, "") // tatweel
    .replace(/[آأإٱ]/g, "ا") // alef forms → ا
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ى/g, "ي") // ى → ي
    .toLowerCase()
    .trim();
}
