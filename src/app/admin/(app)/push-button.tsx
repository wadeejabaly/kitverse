"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { savePushSubscription } from "../actions";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/** Subscribes this phone/browser to approval alerts (iPhone: only after "Add to Home Screen"). */
export default function PushButton({ vapidKey, compact = false }: { vapidKey: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "on" | "unsupported" | "denied">("idle");

  useEffect(() => {
    type S = "idle" | "on" | "unsupported";
    const supported = "serviceWorker" in navigator && "PushManager" in window && !!vapidKey;
    const check: Promise<S> = supported
      ? navigator.serviceWorker.register("/sw.js").then(async (reg): Promise<S> => ((await reg.pushManager.getSubscription()) ? "on" : "idle"))
      : Promise.resolve<S>("unsupported");
    check.then(setState).catch(() => setState("unsupported"));
  }, [vapidKey]);

  if (state === "on" || state === "unsupported") return null;
  return (
    <button
      className={compact
        ? "grid h-10 w-10 place-items-center rounded-xl border border-line-2 bg-raised/40 text-pitch hover:bg-raised"
        : "flex h-10 items-center justify-center gap-2 rounded-xl border border-pitch/40 bg-pitch-soft px-3.5 text-sm font-semibold text-ink hover:bg-pitch-fill/25"}
      aria-label="Enable phone alerts"
      onClick={async () => {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { setState("denied"); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapidKey) });
        await savePushSubscription(sub.toJSON(), navigator.userAgent);
        setState("on");
      }}
    >
      <BellRing className="h-4 w-4" strokeWidth={1.75} />
      {compact ? null : state === "denied" ? "Alerts blocked" : "Enable phone alerts"}
    </button>
  );
}
