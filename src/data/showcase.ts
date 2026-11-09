/**
 * The homepage 360° jersey showcase (owner spec 2026-11-09). The owner picks
 * the shirts; this list is the whole configuration — add, remove or reorder
 * entries here, nothing in the viewer changes.
 *
 * Each view is one transparent frame built by scripts/images/showcase_frames.py
 * (sources listed in scripts/images/showcase-sources.json), normalised to the
 * same box on the pedestal so scale and position never jump. `views` run in
 * rotation order starting from the front: with 2 views the viewer turns
 * front ↔ back, with 4 front → side → back → side, with 8/16/24+ it scrubs.
 * Only real photographs go here — never an invented in-between angle.
 *
 * The FIRST entry is what the hero shows on load (owner: Real Madrid first).
 */
export type ShowcaseJersey = {
  /** Unique id; also the folder under public/home/showcase/. */
  id: string;
  /** Catalogue product the jersey links to (its title is the display name). */
  handle?: string;
  /** Fallback display name when the product is not on the site. */
  name: string;
  /** Optional one-line description. */
  description?: string;
  /** Frame URLs in rotation order, front first. */
  views: string[];
};

export const SHOWCASE_JERSEYS: ShowcaseJersey[] = [
  {
    id: "real-madrid-2026-27-home",
    handle: "real-madrid-2026-27-home-shirt",
    name: "Real Madrid 2026/27 Home Shirt",
    views: ["/home/showcase/real-madrid-2026-27-home/front.webp", "/home/showcase/real-madrid-2026-27-home/back.webp"],
  },
  {
    id: "manchester-united-2007-08-home",
    handle: "manchester-united-2007-08-retro-home-shirt",
    name: "Manchester United 2007/08 Retro Home Shirt",
    views: [
      "/home/showcase/manchester-united-2007-08-home/front.webp",
      "/home/showcase/manchester-united-2007-08-home/back.webp",
    ],
  },
  {
    // Temporary third shirt so switching can be tried before the owner's
    // final five are photographed.
    id: "arsenal-2026-27-home",
    handle: "arsenal-2026-27-home-shirt",
    name: "Arsenal 2026/27 Home Shirt",
    views: ["/home/showcase/arsenal-2026-27-home/front.webp", "/home/showcase/arsenal-2026-27-home/back.webp"],
  },
];

export const SHOWCASE_SETTINGS = {
  /** Turn the shirt slowly on its own while nobody is touching it. */
  autoRotate: true,
  /** How long after the last interaction auto-rotation starts again. */
  idleMs: 6000,
  /** Auto-rotation speed. With only a few real views it steps view to view at this pace. */
  degreesPerSecond: 36,
};

/** The pedestal plate and where the frames sit on it, in the plate's own pixels. */
export const SHOWCASE_STAGE = {
  plate: "/home/showcase/plate.webp",
  width: 1856,
  height: 2304,
  frame: { x: 200, y: 300, width: 1456, height: 1460 },
  /** The shirt itself inside the plate (for the arrows): sleeve tips and vertical middle. */
  shirt: { left: 391, right: 1453, top: 430, bottom: 1737 },
};
