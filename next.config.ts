import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Security headers on every route (storefront, admin, API). CSP stays off until tested against the scripts the site loads. */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : "*.supabase.co";

const nextConfig: NextConfig = {
  devIndicators: false, // the dev badge sat on top of the admin bell
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The home page intro plays again once this marker is no longer fresh in the browser's
      // HTTP cache: after 30 days, or when the visitor clears the cache (src/components/hero/intro.ts).
      { source: "/home/hero/intro-mark.txt", headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }] },
      // The hero's film, posters and podium stills: a week in the browser cache (replaced files get
      // new names). Uncached, the still is revalidated on every visit and Chrome's LCP ignores it.
      { source: "/home/hero/:file(.*\\.(?:webp|mp4))", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
  images: {
    // product photos checked by the bot's photo QA live in Supabase storage
    remotePatterns: [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }],
  },
  experimental: {
    // owner photo uploads from the phone (admin -> Photos)
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default withNextIntl(nextConfig);
