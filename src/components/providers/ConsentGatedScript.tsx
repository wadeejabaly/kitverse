"use client";

import { useEffect } from "react";
import { useConsent } from "./ConsentProvider";

/**
 * Gated third-party script loader: NON-ESSENTIAL SCRIPTS LOAD ONLY AFTER
 * CONSENT. Use it for anything that tracks or sets its own cookies — pixels,
 * remarketing tags, embeds.
 *
 *   <ConsentGatedScript src={pixelUrl} />
 *
 * Not for the PayPal SDK: checkout is an essential function of the store and
 * loads on the checkout page regardless of the analytics choice.
 *
 * Verify both directions in the Network tab before launch: accepting loads the
 * script, declining never does.
 */
export function ConsentGatedScript({
  src,
  id,
  onLoaded,
}: {
  src: string;
  id?: string;
  /** Optional init hook (e.g. fbq bootstrap) — runs once after injection. */
  onLoaded?: () => void;
}) {
  const { consent } = useConsent();

  useEffect(() => {
    if (consent !== "accepted") return;
    const scriptId = id ?? `consent-gated-${src}`;
    if (document.getElementById(scriptId)) return;

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = src;
    script.async = true;
    if (onLoaded) script.addEventListener("load", onLoaded, { once: true });
    document.head.appendChild(script);
    // No cleanup on unmount: consent-approved scripts stay for the session.
  }, [consent, src, id, onLoaded]);

  return null;
}
