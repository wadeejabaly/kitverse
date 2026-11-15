"use client";

import { useEffect, useState } from "react";

/**
 * The Black Friday hero's countdown (owner request 2026-11-15): counts down to 20 Nov "just for
 * show" - the discount itself already works. Renders nothing before hydration (the page is static,
 * so a server-rendered number would be stale) and nothing once the target has passed.
 */
export function BfCountdown({
  to,
  label,
  live,
  units,
}: {
  to: string;
  label: string;
  live: string;
  units: { days: string; hours: string; minutes: string; seconds: string };
}) {
  const target = Date.parse(to);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  if (now === null || now >= target) return null;

  const left = Math.max(0, Math.floor((target - now) / 1000));
  const parts: [number, string][] = [
    [Math.floor(left / 86400), units.days],
    [Math.floor((left % 86400) / 3600), units.hours],
    [Math.floor((left % 3600) / 60), units.minutes],
    [left % 60, units.seconds],
  ];

  return (
    <div className="kv-bf-countdown" role="timer" aria-live="off">
      <span className="kv-bf-countdown-label">{label}</span>
      <div className="kv-bf-countdown-cells">
        {parts.map(([value, unit], i) => (
          <span key={i} className="kv-bf-countdown-cell">
            <span className="kv-bf-countdown-num latin">{String(value).padStart(2, "0")}</span>
            <span className="kv-bf-countdown-unit">{unit}</span>
          </span>
        ))}
      </div>
      <span className="kv-bf-countdown-live">
        <span aria-hidden className="kv-bf-dot" />
        {live}
      </span>
    </div>
  );
}
