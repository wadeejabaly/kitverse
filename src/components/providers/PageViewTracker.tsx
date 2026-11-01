"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics/track";

/**
 * Fires one `page_view` event per route change (owner request 2026-11-03, admin site stats).
 * Mounted once in [locale]/layout.tsx, so it sees every client-side navigation - App Router
 * doesn't remount the layout between pages, only `usePathname()` changes, which is exactly
 * the signal this effect is keyed on.
 */
export function PageViewTracker({ locale }: { locale: string }) {
  const pathname = usePathname();

  useEffect(() => {
    trackPageView(pathname, locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale is static per subtree, only pathname should re-fire this
  }, [pathname]);

  return null;
}
