import type { NextRequest } from "next/server";
import createIntlProxy from "next-intl/middleware";
import { routing } from "./i18n/config";

/**
 * Next 16 renamed middleware.ts → proxy.ts, with the export named `proxy`.
 * Writing `middleware.ts` here silently does nothing — the locale routing
 * simply never runs.
 */
const handleIntlRouting = createIntlProxy(routing);

export function proxy(request: NextRequest) {
  return handleIntlRouting(request);
}

export const config = {
  // Skip api routes, Next internals, Vercel internals, and files with extensions.
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
