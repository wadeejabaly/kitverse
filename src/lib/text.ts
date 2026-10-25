/** Text normalisation for matching what customers type (Arabic dialect, Hebrew, English). Pure. */

const AR_DIACRITICS = /[ً-ٰٟـ]/g; // harakat + tatweel

export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")       // latin accents (Atlético -> Atletico)
    .replace(AR_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Arabic definite article and common prefixes stripped for loose matching ("البرسا" ~ "برسا"). */
export function looseTokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter(Boolean)
    .map((t) => (/^ال[؀-ۿ]{2,}/.test(t) ? t.slice(2) : t));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** 0..1 similarity, tolerant of small typos. */
export function similarity(a: string, b: string): number {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9 * Math.min(x.length, y.length) / Math.max(x.length, y.length) + 0.1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** Normalise a season the way customers write it: "25/26", "2025-26", "25-26", "2026" -> "2025/26" | "2026". */
export function normalizeSeason(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = normalize(s).replace(/\s/g, "");
  let m = t.match(/^(?:20)?(\d{2})[/_-](?:20)?(\d{2})$/);
  if (m) return `20${m[1]}/${m[2]}`;
  m = t.match(/^(19|20)(\d{2})[/_-](\d{2}|\d{4})$/);
  if (m) return `${m[1]}${m[2]}/${m[3].slice(-2)}`;
  m = t.match(/^(19|20)\d{2}$/);
  if (m) return t;
  return null;
}
