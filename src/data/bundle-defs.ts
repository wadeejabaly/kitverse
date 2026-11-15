/**
 * Bundle definitions + the "is this bundle complete" rule, with no catalogue import so the cart and
 * checkout (browser) and the server use the very same rule (owner request 2026-11-15: bundles keep
 * their own prices - a club bundle stays 330, fan bundles = shirt + keychain + scarf). Product helpers
 * that need the catalogue live in ./bundles.ts.
 */
export interface Bundle {
  slug: string;
  /** Team slug, same as the /shop/<team> pages. */
  team: string;
  handles: [string, string, string];
  image?: string;
}

export const BUNDLE_VERSION = "player" as const;

export const BUNDLES: Bundle[] = [
  {
    slug: "real-madrid-2026-27",
    team: "real-madrid",
    handles: ["real-madrid-2026-27-home-shirt", "real-madrid-2026-27-away-shirt", "real-madrid-2026-27-third-shirt"],
    image: "/bundles/real-madrid-2026-27.jpg",
  },
  {
    slug: "barcelona-2026-27",
    team: "barcelona",
    handles: ["barcelona-2026-27-home-shirt", "barcelona-2026-27-away-shirt", "barcelona-2026-27-third-shirt"],
    image: "/bundles/barcelona-2026-27.jpg",
  },
  {
    slug: "manchester-united-2026-27",
    team: "manchester-united",
    handles: ["manchester-united-2026-27-home-shirt", "manchester-united-2026-27-away-shirt", "manchester-united-2026-27-third-shirt"],
    image: "/bundles/manchester-united-2026-27.jpg",
  },
  {
    slug: "manchester-city-2026-27",
    team: "manchester-city",
    handles: ["manchester-city-2026-27-home-shirt", "manchester-city-2026-27-away-shirt", "manchester-city-2026-27-third-shirt"],
    image: "/bundles/manchester-city-2026-27.jpg",
  },
];

/* ------------------------------------------------------------ fan bundles -- */

/**
 * Fan bundles (owner request 2026-11-15): one shirt + the team's keychain + a scarf, for Real Madrid,
 * Barcelona and Manchester United. The shirt is one of the club bundle's three 2026/27 shirts (home,
 * away or third), fan or player, at the bundle shirt price (admin Pricing groups `bundle_fan`,
 * `bundle_fan_long`, `bundle_player`, `bundle_player_long` - the old prices); the keychain and scarf at
 * their `bundle_price` (15 / 45). The page shows how much that saves against the normal prices.
 */
export interface FanBundle {
  slug: string;
  team: string;
  /** The club bundle whose three shirts the shopper picks from. */
  club: string;
}

export const FAN_BUNDLES: FanBundle[] = [
  { slug: "fan-real-madrid", team: "real-madrid", club: "real-madrid-2026-27" },
  { slug: "fan-barcelona", team: "barcelona", club: "barcelona-2026-27" },
  { slug: "fan-manchester-united", team: "manchester-united", club: "manchester-united-2026-27" },
];

/**
 * Which bundle slugs on an order are COMPLETE, so their lines may take the bundle prices (the server
 * calls this; the browser's word is never enough). A club bundle = its three shirts, player version,
 * the same quantity each. A fan bundle = N of the club's shirts + N of the team's keychain + N of the
 * team's scarves, all tagged with the slug. Anything else with a bundle tag is priced normally.
 */
export function completeBundles(
  items: { handle: string; version: string; qty: number; bundle?: string | null }[],
  accessories: { handle: string; qty: number; bundle?: string | null }[],
  /** team slug + category of an accessory handle (server: the accessories file; browser: the cart's accessory info) */
  accessoryInfo: (handle: string) => { team: string; category: string } | undefined,
): Set<string> {
  const ok = new Set<string>();
  const slugs = new Set([...items, ...accessories].map((x) => x.bundle).filter((s): s is string => !!s));
  for (const slug of slugs) {
    const lines = items.filter((i) => i.bundle === slug);
    const extras = accessories.filter((a) => a.bundle === slug);
    const club = BUNDLES.find((b) => b.slug === slug);
    if (club) {
      if (extras.length || lines.some((l) => l.version !== BUNDLE_VERSION || !club.handles.includes(l.handle))) continue;
      const per = club.handles.map((h) => lines.filter((l) => l.handle === h).reduce((n, l) => n + l.qty, 0));
      if (per[0] > 0 && per.every((n) => n === per[0])) ok.add(slug);
      continue;
    }
    const fan = FAN_BUNDLES.find((b) => b.slug === slug);
    const fanClub = fan && BUNDLES.find((b) => b.slug === fan.club);
    if (!fan || !fanClub) continue;
    if (lines.some((l) => !fanClub.handles.includes(l.handle))) continue;
    const shirts = lines.reduce((n, l) => n + l.qty, 0);
    let keychains = 0, scarves = 0, stray = false;
    for (const a of extras) {
      const acc = accessoryInfo(a.handle);
      if (!acc || acc.team !== fan.team) { stray = true; break; }
      if (acc.category === "keychain") keychains += a.qty; else if (acc.category === "scarf") scarves += a.qty; else stray = true;
    }
    if (!stray && shirts > 0 && keychains === shirts && scarves === shirts) ok.add(slug);
  }
  return ok;
}
