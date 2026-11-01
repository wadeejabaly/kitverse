"use client";

/**
 * The storefront's own first-party event log (owner request 2026-11-03: "make in admin site
 * stats traffic checkout and add to cart"). Posts a small, fire-and-forget beacon to
 * /api/track, which writes one row to `site_events` - see that migration's docstring for
 * why this is session-scoped and anonymous rather than a persistent tracking cookie.
 *
 * `sessionId()` is the one piece of client state this needs: a random id kept in
 * sessionStorage (not localStorage - it's meant to reset when the tab/browser session ends,
 * the same "one visit" window a human would recognize), so the admin stats page can tell
 * "500 pageviews" apart from "80 different people looked at 500 pages".
 */

const SESSION_KEY = "kv_sid";

let cachedSessionId: string | null = null;
/** True only for the very first call this tab has ever made - see trackPageView(). */
let isFirstCallThisTab = true;

function sessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    cachedSessionId = id;
    return id;
  } catch {
    // Private browsing / storage disabled: fall back to a per-page-load id. Every event in
    // this one page view still shares it (the module-level cache), it just won't carry
    // across a client-side navigation - traffic counts are still roughly right, just not
    // perfectly deduped for this one visitor.
    cachedSessionId = crypto.randomUUID();
    return cachedSessionId;
  }
}

type EventType = "page_view" | "add_to_cart" | "checkout_start";

function send(type: EventType, extra: Record<string, string | undefined> = {}) {
  try {
    const body = JSON.stringify({ type, sessionId: sessionId(), ...extra });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch {
    // Analytics must never be the thing that breaks a page.
  }
}

/** One per route change. `document.referrer`'s hostname is sent only on this tab's first
 *  call (the landing page), not on every client-side navigation after it - a visitor who
 *  arrived from Instagram and then clicked around the site has ONE referrer, not five. */
export function trackPageView(path: string, locale: string) {
  const referrerHost = isFirstCallThisTab ? referrerHostname() : undefined;
  isFirstCallThisTab = false;
  send("page_view", { path, locale, referrerHost });
}

export function trackAddToCart(productHandle: string) {
  send("add_to_cart", { productHandle });
}

export function trackCheckoutStart() {
  send("checkout_start");
}

function referrerHostname(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname;
    // Our own domain isn't a "referrer" worth recording - it's just the previous page.
    return host === window.location.hostname ? undefined : host;
  } catch {
    return undefined;
  }
}
