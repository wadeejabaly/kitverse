/** Size recommendation from the owner's own rules of thumb in the DMs (177cm/80kg -> L, 185/96 -> XXL). Pure. */
const ORDER = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"] as const;

export function recommendSize(heightCm: number, weightKg: number, version: "fan" | "player") {
  let i = weightKg < 60 ? 0 : weightKg < 70 ? 1 : weightKg <= 80 ? 2 : weightKg < 90 ? 3 : weightKg < 100 ? 4 : weightKg < 112 ? 5 : 6;
  if (heightCm >= 188 && i < 6) i++;          // very tall: longer shirt
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
