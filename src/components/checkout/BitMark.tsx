"use client";

import { useState } from "react";

/**
 * The official Bit logo, once the owner adds the file at
 * public/brand/bit-logo.svg (Bank Hapoalim's trademark - never redrawn here).
 * Until then, or if it fails to load, a plain text label stands in.
 */
export function BitMark({ className = "h-7" }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  // a 404 that finished before hydration never reaches onError - check when the element attaches
  const check = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  };
  if (failed) {
    return (
      <span className="latin inline-flex items-center rounded-md border border-rule px-2 py-0.5 text-sm font-extrabold lowercase tracking-tight" dir="ltr">
        bit
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- optional owner-supplied file; must fall back silently when absent
    <img ref={check} src="/brand/bit-logo.svg" alt="bit" className={`${className} w-auto`} onError={() => setFailed(true)} />
  );
}
