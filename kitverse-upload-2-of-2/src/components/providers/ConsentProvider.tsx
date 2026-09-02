"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Cookie-consent state.
 *
 * - The choice persists in a FIRST-PARTY cookie (this one IS essential).
 * - Non-essential scripts load ONLY after "accepted" — gate them with
 *   <ConsentGatedScript> or read `consent` from useConsent().
 * - "cookie settings" in the footer reopens the banner via openSettings().
 */

export type ConsentChoice = "accepted" | "declined";
/** "unknown" = no stored choice yet (first visit, or before hydration). */
export type ConsentState = ConsentChoice | "unknown";

const CONSENT_COOKIE = "kv-consent";
const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 365; // 12 months, then re-ask

interface ConsentContextValue {
  /** Current choice. Gate every non-essential script on === "accepted". */
  consent: ConsentState;
  /** True once the stored cookie has been read (avoids a banner flash). */
  ready: boolean;
  /** True while the footer "cookie settings" link has reopened the banner. */
  settingsOpen: boolean;
  accept: () => void;
  decline: () => void;
  openSettings: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readConsentCookie(): ConsentState {
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.split("=")[1];
  return value === "accepted" || value === "declined" ? value : "unknown";
}

function writeConsentCookie(value: ConsentChoice) {
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE_S}; SameSite=Lax`;
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>("unknown");
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setConsent(readConsentCookie());
    setReady(true);
  }, []);

  const choose = useCallback((value: ConsentChoice) => {
    writeConsentCookie(value);
    setConsent(value);
    setSettingsOpen(false);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      ready,
      settingsOpen,
      accept: () => choose("accepted"),
      decline: () => choose("declined"),
      openSettings: () => setSettingsOpen(true),
    }),
    [consent, ready, settingsOpen, choose],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent must be used inside <ConsentProvider>");
  }
  return ctx;
}
