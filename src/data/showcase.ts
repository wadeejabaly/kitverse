/**
 * The homepage 360° jersey showcase (owner spec 2026-11-09). The owner picks
 * the shirts; this list is the whole configuration — add, remove or reorder
 * entries here, nothing in the viewer changes.
 *
 * Each view is one transparent frame built by scripts/images/showcase_frames.py
 * (sources listed in scripts/images/showcase-sources.json), normalised to the
 * same box so scale and position never jump; SHOWCASE_STAGE below stands that
 * box on the podium in the hero video's last frame. `views` is a
 * real turntable sequence in rotation order, front first, evenly spaced
 * (24 frames = one every 15°). A shirt only turns when it has at least
 * MIN_FRAMES_FOR_360 frames; with fewer (e.g. just a front and a back photo)
 * it is shown still — a 360° turn is never faked from two pictures.
 *
 * The FIRST entry is what the hero shows on load (Real Madrid home, also the
 * most popular).
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

const front = (id: string) => [`/home/showcase/${id}/front.webp`];

/**
 * The site's 10 most popular shirts (owner request 2026-11-12), most popular
 * first, ranked on 2026-11-12 from site_events (distinct visitors viewing the
 * product page + 3x add-to-cart) and real orders (5x). Front views only, so
 * each is shown still; a shirt gets the 360° drag once it has a real
 * turntable sequence (24 frames, `<id>/00.webp`...`23.webp`, built by the
 * frames script's `sequence` config entries).
 */
export const SHOWCASE_JERSEYS: ShowcaseJersey[] = [
  { id: "real-madrid-2026-27-home", handle: "real-madrid-2026-27-home-shirt", name: "Real Madrid 2026/27 Home Shirt", views: front("real-madrid-2026-27-home") },
  { id: "barcelona-2026-27-home", handle: "barcelona-2026-27-home-shirt", name: "Barcelona 2026/27 Home Shirt", views: front("barcelona-2026-27-home") },
  { id: "manchester-united-2026-27-home", handle: "manchester-united-2026-27-home-shirt", name: "Manchester United 2026/27 Home Shirt", views: front("manchester-united-2026-27-home") },
  { id: "real-madrid-2026-27-away", handle: "real-madrid-2026-27-away-shirt", name: "Real Madrid 2026/27 Away Shirt", views: front("real-madrid-2026-27-away") },
  { id: "barcelona-2026-27-away", handle: "barcelona-2026-27-away-shirt", name: "Barcelona 2026/27 Away Shirt", views: front("barcelona-2026-27-away") },
  { id: "liverpool-2026-27-home", handle: "liverpool-2026-27-home-shirt", name: "Liverpool 2026/27 Home Shirt", views: front("liverpool-2026-27-home") },
  { id: "barcelona-2026-27-third", handle: "barcelona-2026-27-third-shirt", name: "Barcelona 2026/27 Third Shirt", views: front("barcelona-2026-27-third") },
  { id: "arsenal-2026-27-home", handle: "arsenal-2026-27-home-shirt", name: "Arsenal 2026/27 Home Shirt", views: front("arsenal-2026-27-home") },
  { id: "france-2026-home", handle: "france-2026-home-shirt", name: "France 2026 Home Shirt", views: front("france-2026-home") },
  { id: "bayern-munich-2026-27-away", handle: "bayern-munich-2026-27-away-shirt", name: "Bayern Munich 2026/27 Away Shirt", views: front("bayern-munich-2026-27-away") },
];

export const SHOWCASE_SETTINGS = {
  /** Turn the shirt slowly on its own while nobody is touching it. */
  autoRotate: true,
  /** How long after the last interaction auto-rotation starts again. */
  idleMs: 6000,
  /** Auto-rotation speed (only shirts with a full 360° sequence turn). */
  degreesPerSecond: 24,
};

/**
 * Every frame is the same 1456x1460 canvas (scripts/images/showcase_frames.py):
 * the hem sits on row 1437, the shirt is centred on x 722, and across the
 * current frames the widest shirt spans x 136-1308 from row 128 down.
 */
const FRAME = { width: 1456, height: 1460, hemY: 1437, cx: 722, left: 136, right: 1308, top: 128 };

export type ShowcaseStage = {
  /** The film frame the positions are in. */
  width: number;
  height: number;
  /** Where a frame canvas is drawn. */
  frame: { x: number; y: number; width: number; height: number };
  /** The shirt's extent on the podium: sleeve tips, collar, hem, centre. */
  shirt: { left: number; right: number; top: number; bottom: number; cx: number };
  /** Width of the soft contact shadow on the podium top. */
  shadowWidth: number;
};

/** Stands a frame canvas on a podium: its hem on (cx, top), scaled by `scale`. */
function standOn(width: number, height: number, podium: { cx: number; top: number }, scale: number, shadowWidth: number): ShowcaseStage {
  return {
    width,
    height,
    frame: {
      x: podium.cx - FRAME.cx * scale,
      y: podium.top - FRAME.hemY * scale,
      width: FRAME.width * scale,
      height: FRAME.height * scale,
    },
    shirt: {
      left: podium.cx - (FRAME.cx - FRAME.left) * scale,
      right: podium.cx + (FRAME.right - FRAME.cx) * scale,
      top: podium.top - (FRAME.hemY - FRAME.top) * scale,
      bottom: podium.top,
      cx: podium.cx,
    },
    shadowWidth,
  };
}

/**
 * The landscape film's last frame (public/home/hero/podium.webp, 1920x1080):
 * the podium's top surface is an ellipse centred on (615, 792), ~910 wide, its
 * back rim at y 735 and its front rim at y 850. The hem lands on that centre.
 * Scale 0.43 keeps the collar below the overlaid header (banner + header
 * ~145px) down to a 1280x720 window; the landscape-phone strip enlarges the
 * shirt with --kv-shirt-scale (globals.css), where no header overlaps it.
 */
export const SHOWCASE_STAGE = standOn(1920, 1080, { cx: 615, top: 797 }, 0.43, 470);

/**
 * The portrait film's last frame (public/home/hero/podium-portrait.webp,
 * 1080x1920, used on every portrait screen): the podium's top surface is
 * centred on (525, 1440), ~786 wide, back rim y 1385, front rim y 1495; the
 * whole top third above the floodlights is empty night, where the header sits.
 * Scale 0.6 keeps the collar (y 658) clear of the header on a 375x667 phone.
 */
export const SHOWCASE_STAGE_PORTRAIT = standOn(1080, 1920, { cx: 525, top: 1442 }, 0.6, 560);
