/** The site language for a phone's Accept-Language (owner 2026-11-16): ar -> ar, en -> en, he and anything else -> he. */
export function phoneLocale(acceptLanguage: string | null): "ar" | "en" | "he" {
  const first = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .filter((x) => x.lang && x.lang !== "*")
    .sort((a, b) => b.q - a.q)[0]?.lang;
  if (first === "ar") return "ar";
  if (first === "en") return "en";
  return "he";
}
