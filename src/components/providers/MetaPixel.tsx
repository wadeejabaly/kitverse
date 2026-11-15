"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useConsent } from "@/components/providers/ConsentProvider";
import { META_PIXEL_ID, pixel } from "@/lib/analytics/meta-pixel";

/**
 * Loads Meta's pixel script once the visitor has ACCEPTED cookies (never before, never on
 * "declined"), then sends one PageView per route change. Renders nothing. See
 * src/lib/analytics/meta-pixel.ts for the events and what they contain.
 */
export function MetaPixel() {
  const { consent } = useConsent();
  const pathname = usePathname();
  const loaded = useRef(false);

  useEffect(() => {
    if (!META_PIXEL_ID || consent !== "accepted" || loaded.current) return;
    loaded.current = true;
    // Meta's standard base code, unminified: a queue stub until fbevents.js arrives.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any;
    if (!w.fbq) {
      const n: any = function (...args: unknown[]) {
        if (n.callMethod) n.callMethod(...args);
        else n.queue.push(args);
      };
      w.fbq = n;
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
    }
    w.fbq("init", META_PIXEL_ID);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    pixel.pageView();
  }, [consent]);

  // later in-site navigations (the first PageView is sent right after init)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (loaded.current) pixel.pageView();
  }, [pathname]);

  return null;
}
