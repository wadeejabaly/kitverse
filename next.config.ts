import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Security headers, applied to every route.
 *
 * CSP is COMMENTED OUT on purpose. Enable it before launch and TEST it against
 * the scripts this build actually loads — the PayPal SDK in particular — since
 * a blind CSP blocks exactly the scripts checkout needs.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // {
  //   key: "Content-Security-Policy",
  //   value: [
  //     "default-src 'self'",
  //     "script-src 'self' 'unsafe-inline' <paypal sdk origin>", // TEST before enabling
  //     "style-src 'self' 'unsafe-inline'",
  //     "img-src 'self' data: blob:",
  //     "font-src 'self'",
  //     "connect-src 'self' <paypal api origin>",
  //     "frame-ancestors 'none'",
  //   ].join("; "),
  // },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // outputFileTracingIncludes: {} — add for any file read from disk at runtime.
  // Without it those reads work locally and 500 on the deployed host.
};

export default withNextIntl(nextConfig);
