/**
 * Team-name slugifier — turns "1. FC Köln" into "1-fc-koln", "Atlético Madrid"
 * into "atletico-madrid", etc. Used to derive `teams[].slug` in
 * collections.json and, at call time, to match a Product's `team` string
 * against a requested slug in `byTeam()`.
 *
 * scripts/import-catalog.mjs duplicates this exact logic (it runs under
 * plain Node before any build step, so it cannot import a .ts file) — keep
 * the two in sync if this ever changes.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
