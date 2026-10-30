/**
 * Size recommendation from the owner's own rules of thumb in the DMs
 * (177cm/80kg -> L, 185/96 -> XXL), extended 2026-11-02 with five more real
 * fit reports the owner gave directly (himself + four friends):
 *   177/83 -> L (XL was a bit big)
 *   182/62 -> M (fits well)
 *   185/60 -> M was tight, L fits better
 *   192/70 -> XXL (fits well)
 *   179/85 -> XL
 * Every one of those seven points (the two original plus these five) now
 * matches exactly — see the "sizing" describe block in guard.test.ts. Pure.
 */
const ORDER = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"] as const;

export function recommendSize(heightCm: number, weightKg: number, version: "fan" | "player") {
  // L's upper edge moved from 80 to 84kg: 177/83 still wants L, not XL
  // (179/85 is the first confirmed XL at that height).
  let i = weightKg < 60 ? 0 : weightKg < 70 ? 1 : weightKg <= 84 ? 2 : weightKg < 90 ? 3 : weightKg < 100 ? 4 : weightKg < 112 ? 5 : 6;

  // Tall-but-lean frame (185/60 wants L, not M, below the "very tall"
  // threshold below) needs one size up on its own.
  if (heightCm >= 183 && heightCm < 188 && weightKg < 65 && i < 6) i++;

  // Very tall: longer shirt. 192/70 reported needing a FULL two sizes up
  // from its plain weight bracket (L -> XXL), so the bump past ~190cm is
  // steeper than the 188-190 band — one real report, worth another data
  // point before trusting the 191 cutoff too far.
  if (heightCm >= 188 && i < 6) i++;
  if (heightCm >= 191 && i < 6) i++;

  if (heightCm < 165 && weightKg < 75 && i > 0) i--;
  const fits = ORDER[i];
  const roomy = ORDER[Math.min(6, i + 1)];
  return {
    recommended: version === "player" ? fits : fits,
    if_you_like_it_loose: roomy,
    note: version === "player"
      ? "Player version is slim fit; owner usually advises one size up from the customer's normal size if they like it loose."
      : "Fan version fits normally.",
  };
}
