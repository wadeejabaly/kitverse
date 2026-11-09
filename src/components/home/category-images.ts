/**
 * Background photo for each home-page category card (owner redesign
 * 2026-11-09, the reference screenshots' four-up Clubs / National Teams /
 * Retro Classics / Accessories grid under the hero).
 *
 * All four were generated with Higgsfield for this grid, and three of them
 * are built from the shop's own catalog/artwork as the image reference, so no
 * badge, sponsor or manufacturer mark was invented:
 *   - clubs:       public/products/real-madrid-2026-27-home-shirt(-crest).jpg
 *   - national:    public/products/argentina-2026-home-shirt-crest.jpg
 *   - accessories: public/patches/champions-league-general.jpg (the real
 *                  patch artwork the patch picker sells) + a "10" print
 *   - retro:       the catalog has no retro photography yet, so this one is a
 *                  deliberately UNBRANDED vintage striped shirt — no crest, no
 *                  logo, no sponsor — rather than a made-up club shirt. Swap it
 *                  for a real retro product photo once one is in the catalog.
 *
 * Each photo keeps its subject in the right half with a calm, dark left half
 * for the title (see .kv-cat-card-shade). `focus` is the
 * image's object-position inside the card.
 */
export interface CategoryImage {
  src: string;
  focus: string;
}

export const CATEGORY_IMAGES: Record<string, CategoryImage> = {
  clubs: { src: "/home/cat-clubs.webp", focus: "70% 35%" },
  national: { src: "/home/cat-national.webp", focus: "75% 40%" },
  retro: { src: "/home/cat-retro.webp", focus: "65% 30%" },
  accessories: { src: "/home/cat-accessories.webp", focus: "70% 50%" },
};
