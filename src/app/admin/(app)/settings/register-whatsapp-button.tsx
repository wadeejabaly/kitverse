"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { registerWhatsAppNumber } from "../../whatsapp-actions";
import { button, input, cx } from "../../ui";

/**
 * One-time fix for Meta error 133010 "Account not registered" (owner report 2026-11-02). Adding a
 * number in WhatsApp Manager is not the same as registering it on the Cloud API - there's no button
 * for that anywhere in WhatsApp Manager, only this direct call. The PIN becomes the number's two-step
 * verification PIN; Meta caps registration at 10 calls per number per 72h, so this is meant to be
 * clicked once and left alone once it succeeds.
 */
export function RegisterWhatsAppButton({ defaultPin }: { defaultPin: string }) {
  const [pin, setPin] = useState(defaultPin);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof registerWhatsAppNumber>> | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await registerWhatsAppNumber(pin));
    } catch {
      setResult({ ok: false, message: "The request failed to run - try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        6-digit PIN (becomes the number&apos;s two-step verification PIN - keep it somewhere safe)
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          className={cx(input, "w-32 font-mono")}
        />
      </label>
      <button type="button" disabled={busy || pin.length !== 6} onClick={run} className={cx(button.primary, "self-start")}>
        <Smartphone className="h-4 w-4" /> {busy ? "Registering..." : "Register number"}
      </button>
      {result ? <p className={cx("text-xs", result.ok ? "text-pitch" : "text-red")}>{result.message}</p> : null}
    </div>
  );
}
