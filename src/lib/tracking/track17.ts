import "server-only";
import { env } from "@/lib/env";
import { parseTrackInfo, type TrackResult } from "./stage";

/**
 * 17TRACK tracking API (v2.2), used to read the Junhe shipments of supplier batches
 * (owner request 2026-11-13). Needs `TRACK17_API_KEY` (17TRACK API dashboard -> Settings ->
 * Security Key); without it nothing is called and the admin says tracking is off.
 * A number is registered once (that is what uses the account's quota), then read as often as needed.
 * The carrier is auto-detected by 17TRACK (Junhe is one of its carriers).
 */

const BASE = "https://api.17track.net/track/v2.2";
/** 17TRACK's "already registered" answer - not an error for us */
const ALREADY_REGISTERED = -18019901;

export const trackingEnabled = () => !!env().TRACK17_API_KEY;

async function call(path: string, body: unknown): Promise<{ accepted: unknown[]; rejected: { number?: string; error?: { code?: number; message?: string } }[] }> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "17token": env().TRACK17_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { code?: number; data?: { accepted?: unknown[]; rejected?: unknown[] }; message?: string } | null;
  if (!res.ok || !json || json.code !== 0) throw new Error(`17TRACK ${path}: ${res.status} ${json?.message ?? json?.code ?? ""}`.trim());
  return { accepted: json.data?.accepted ?? [], rejected: (json.data?.rejected ?? []) as { error?: { code?: number; message?: string } }[] };
}

/** Start tracking a number. Returns null when fine (also when it was registered before), else the reason. */
export async function registerNumber(number: string): Promise<string | null> {
  const r = await call("register", [{ number }]);
  if (r.accepted.length) return null;
  const err = r.rejected[0]?.error;
  if (err?.code === ALREADY_REGISTERED) return null;
  return err?.message ?? "17TRACK did not accept this number";
}

/** The current tracking of a registered number (null while 17TRACK has nothing for it yet). */
export async function trackNumber(number: string): Promise<TrackResult | null> {
  const r = await call("gettrackinfo", [{ number }]);
  if (r.accepted.length) return parseTrackInfo(r.accepted[0]);
  const err = r.rejected[0]?.error;
  if (err) throw new Error(err.message ?? `17TRACK error ${err.code}`);
  return null;
}
