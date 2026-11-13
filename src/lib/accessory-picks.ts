import type { CartAccessoryInfo } from "@/components/cart/CartView";
import { slugify } from "@/data/slug";

/** At most this many suggestions, so the order summary stays short. */
const MAX_PICKS = 4;

/**
 * Picks the accessories to suggest for the shirts in the cart (owner request 2026-11-13: "if he
 * has Barcelona shirts suggest the Barcelona scarf and keychain; mixed shirts - based on his picks").
 *
 * Teams are ranked by how many of their shirts are in the cart (first one added wins a tie); for each
 * team, one scarf (the first orderable design) and its keychain - skipping a category the shopper
 * already has for that team. Only accessories that are orderable (visible, in stock) are passed in.
 */
export function pickAccessories<A extends Pick<CartAccessoryInfo, "category" | "team">>(
  shirts: { team?: string; qty: number }[],
  accessories: A[],
  inCart: { team: string; category: string }[],
  max = MAX_PICKS,
): A[] {
  const qtyByTeam = new Map<string, number>();
  for (const s of shirts) {
    if (!s.team) continue;
    const slug = slugify(s.team);
    qtyByTeam.set(slug, (qtyByTeam.get(slug) ?? 0) + s.qty);
  }
  // Map keeps insertion order, and sort is stable - so equal counts stay in cart order
  const teams = [...qtyByTeam.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
  const have = new Set(inCart.map((a) => `${slugify(a.team)}|${a.category}`));

  const perTeam = teams.map((slug) =>
    (["scarf", "keychain"] as const)
      .filter((category) => !have.has(`${slug}|${category}`))
      .map((category) => accessories.find((a) => a.category === category && slugify(a.team) === slug))
      .filter((a): a is A => Boolean(a)),
  );
  // One team: its scarf + keychain. Several teams: take turns, so every team in the cart gets a
  // pick before any team gets its second one.
  const out: A[] = [];
  for (let round = 0; out.length < max && perTeam.some((list) => list.length > round); round++) {
    for (const list of perTeam) {
      if (out.length >= max) break;
      if (list[round]) out.push(list[round]);
    }
  }
  return out;
}
