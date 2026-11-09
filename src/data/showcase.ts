/**
 * The homepage 360° jersey showcase (owner spec 2026-11-09). The owner picks
 * the shirts; this list is the whole configuration — add, remove or reorder
 * entries here, nothing in the viewer changes.
 *
 * Each view is one transparent frame built by scripts/images/showcase_frames.py
 * (sources listed in scripts/images/showcase-sources.json), normalised to the
 * same box on the pedestal so scale and position never jump. `views` is a
 * real turntable sequence in rotation order, front first, evenly spaced
 * (24 frames = one every 15°). A shirt only turns when it has at least
 * MIN_FRAMES_FOR_360 frames; with fewer (e.g. just a front and a back photo)
 * it is shown still — a 360° turn is never faked from two pictures.
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
  /** A demonstration item (not a product photo): left out of production builds. */
  demo?: boolean;
};

/** Fewer frames than this and the shirt is shown still (no rotation). */
export const MIN_FRAMES_FOR_360 = 16;

const sequence = (id: string, n: number) =>
  Array.from({ length: n }, (_, i) => `/home/showcase/${id}/${String(i).padStart(2, "0")}.webp`);

export const SHOWCASE_JERSEYS: ShowcaseJersey[] = [
  {
    id: "real-madrid-2026-27-home",
    handle: "real-madrid-2026-27-home-shirt",
    name: "Real Madrid 2026/27 Home Shirt",
    views: ["/home/showcase/real-madrid-2026-27-home/front.webp", "/home/showcase/real-madrid-2026-27-home/back.webp"],
  },
  {
    // An unbranded 3D-rendered test shirt (24 frames, one every 15°) so the
    // full 360° drag can be tried before the real turntable photos exist.
    // Not a product: demo-only, never in a production build.
    id: "test-360",
    name: "360° test shirt",
    views: sequence("test-360", 24),
    demo: true,
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
];

export const SHOWCASE_SETTINGS = {
  /** Turn the shirt slowly on its own while nobody is touching it. */
  autoRotate: true,
  /** How long after the last interaction auto-rotation starts again. */
  idleMs: 6000,
  /** Auto-rotation speed (only shirts with a full 360° sequence turn). */
  degreesPerSecond: 24,
};

/** The pedestal plate and where the frames sit on it, in the plate's own pixels. */
export const SHOWCASE_STAGE = {
  plate: "/home/showcase/plate.webp",
  width: 1856,
  height: 2304,
  frame: { x: 200, y: 300, width: 1456, height: 1460 },
  /** The original shirt inside the plate: sleeve tips, top, hem, centre (also the pedestal's centre). */
  shirt: { left: 391, right: 1453, top: 430, bottom: 1737, cx: 922 },
  /** Width of the soft contact shadow on the pedestal top. */
  shadowWidth: 760,
};
