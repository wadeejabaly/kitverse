/**
 * Background photo for each home-page category card (owner reference
 * 2026-10-27, the four-up "Clubs / National Teams / Retro Classics /
 * Accessories" grid immediately under the hero). Placeholder stand-ins for
 * now — the owner is supplying real category photography to replace these,
 * one file swap each, no code change needed.
 *
 * These are plain studio product shots (white background, centred shirt),
 * not the reference's cropped, angled fabric photography, so each entry
 * also carries a `focus` (CSS background-position) and `zoom` (CSS
 * background-size, a percentage) tuned to crop IN past the white margin and
 * read as a close, textured shot rather than a whole garment on a blank
 * tile — see CategoryGrid.tsx for how these combine with the navy/electric
 * duotone tint. Retune or drop `zoom`/`focus` per card once its real photo
 * is in (a lifestyle shot usually wants `zoom: "100%"` and `focus: "center"`,
 * the tile's own natural crop).
 */
export interface CategoryImage {
  src: string;
  focus: string;
  zoom: string;
}

export const CATEGORY_IMAGES: Record<string, CategoryImage> = {
  clubs: {
    src: "/products/real-madrid-2026-27-home-shirt.jpg",
    focus: "center 30%",
    zoom: "230%",
  },
  national: {
    src: "/products/argentina-2026-27-home-shirt.jpg",
    focus: "center 25%",
    zoom: "230%",
  },
  retro: {
    src: "/products/barcelona-2026-27-home-shirt.jpg",
    focus: "center 30%",
    zoom: "230%",
  },
  accessories: {
    src: "/products/keychain-arsenal.jpg",
    focus: "center",
    zoom: "160%",
  },
};
