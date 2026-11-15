/**
 * "Don't count me" (owner request 2026-11-16: "each time i go to my website it counts me as a
 * visitor"). A browser that has opened the admin is marked as the owner's device with the
 * cookie `kv_owner=1` (1 year): from then on the site's own stats (/api/track) and the Meta
 * Pixel ignore it. The cookie (not only localStorage) is what /api/track checks on the server,
 * so even an old cached page can't count him.
 */
export const OWNER_COOKIE = "kv_owner";

export function isOwnerDevice(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(/;\s*/).some((c) => c === `${OWNER_COOKIE}=1`);
}

export function markOwnerDevice(on = true) {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `${OWNER_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax; secure`
    : `${OWNER_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
}
