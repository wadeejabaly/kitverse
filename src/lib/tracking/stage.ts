/**
 * Pure parts of shipment tracking (owner request 2026-11-13), kept apart so they can be tested
 * (stage.test.ts): reading a 17TRACK answer, and deciding what it means for the orders.
 *
 * Owner's flow: the supplier ships a batch with Junhe -> the orders are "on the way" (status
 * `produced`); Junhe shows it delivered to the OWNER -> the orders are out for delivery to the
 * customers (`with_courier`, 24-72 hours); 3 days after the owner got it -> `delivered`.
 */

export interface TrackEvent {
  /** ISO time as given by the carrier (may carry its own offset) */
  time: string | null;
  description: string;
  location: string | null;
}

export interface TrackResult {
  /** 17TRACK main status: NotFound, InfoReceived, InTransit, Expired, AvailableForPickup, OutForDelivery, DeliveryFailure, Delivered, Exception */
  status: string;
  subStatus: string | null;
  /** newest first */
  events: TrackEvent[];
}

/** What a tracking result means for the orders in the shipment. */
export type ShipmentStage = "none" | "shipped" | "received";

/** Statuses that mean the parcel has left the supplier. InfoReceived (label printed) and NotFound do not. */
const MOVING = new Set(["InTransit", "OutForDelivery", "AvailableForPickup", "DeliveryFailure", "Exception", "Expired"]);

export function shipmentStage(r: Pick<TrackResult, "status" | "events"> | null): ShipmentStage {
  if (!r) return "none";
  if (r.status === "Delivered") return "received";
  if (MOVING.has(r.status)) return "shipped";
  return "none";
}

/** Days after the owner receives a shipment that its orders count as delivered (owner: "after 3 days of me getting the shipment"). */
export const DELIVERED_AFTER_DAYS = 3;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** One accepted item of a 17TRACK v2.2 `gettrackinfo` answer -> TrackResult. Defensive: any missing field is tolerated. */
export function parseTrackInfo(item: unknown): TrackResult | null {
  const info = (item as { track_info?: Record<string, unknown> } | null)?.track_info;
  if (!info || typeof info !== "object") return null;
  const latest = (info.latest_status ?? {}) as Record<string, unknown>;
  const providers = ((info.tracking as { providers?: unknown[] } | undefined)?.providers ?? []) as { events?: unknown[] }[];
  const events: TrackEvent[] = [];
  for (const p of providers) {
    for (const e of p?.events ?? []) {
      const ev = e as Record<string, unknown>;
      const description = str(ev.description);
      if (!description) continue;
      events.push({ time: str(ev.time_iso) ?? str(ev.time_utc), description, location: str(ev.location) });
    }
  }
  events.sort((a, b) => (Date.parse(b.time ?? "") || 0) - (Date.parse(a.time ?? "") || 0));
  return { status: str(latest.status) ?? "NotFound", subStatus: str(latest.sub_status), events };
}

/** When the owner got the shipment: the newest event's time when the parcel shows delivered, else `fallback`. */
export function receivedTime(r: TrackResult, fallback: Date): Date {
  const t = Date.parse(r.events[0]?.time ?? "");
  return Number.isFinite(t) && t <= fallback.getTime() ? new Date(t) : fallback;
}
