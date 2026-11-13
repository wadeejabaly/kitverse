import { describe, expect, it } from "vitest";
import { addWorkingDays, estimatedArrival } from "./eta";
import { parseTrackInfo, receivedTime, shipmentStage } from "../tracking/stage";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("addWorkingDays", () => {
  it("skips Friday and Saturday", () => {
    // Thu 12 Nov 2026 + 1 working day = Sun 15 Nov
    expect(addWorkingDays(day("2026-11-12"), 1).toISOString().slice(0, 10)).toBe("2026-11-15");
    // Sun 15 Nov + 10 working days = Sun 29 Nov
    expect(addWorkingDays(day("2026-11-15"), 10).toISOString().slice(0, 10)).toBe("2026-11-29");
  });
});

describe("estimatedArrival", () => {
  const confirmedAt = "2026-11-15T08:00:00Z"; // Sunday, Israel morning
  it("10-20 working days from confirmation while it is on the way", () => {
    for (const status of ["confirmed", "in_supplier_batch", "produced"]) {
      expect(estimatedArrival({ status, confirmedAt }, new Date("2026-11-16T10:00:00Z"))).toEqual({ kind: "window", from: "2026-11-29", to: "2026-12-13" });
    }
  });
  it("starts the window tomorrow once the first date has passed, then says soon", () => {
    expect(estimatedArrival({ status: "produced", confirmedAt }, new Date("2026-12-02T10:00:00Z"))).toEqual({ kind: "window", from: "2026-12-03", to: "2026-12-13" });
    expect(estimatedArrival({ status: "produced", confirmedAt }, new Date("2026-12-13T10:00:00Z"))).toEqual({ kind: "soon" });
  });
  it("out for delivery: 1-3 days from the day it went out", () => {
    const out = "2026-11-20T15:00:00Z";
    expect(estimatedArrival({ status: "with_courier", confirmedAt, outForDeliveryAt: out }, new Date("2026-11-20T16:00:00Z"))).toEqual({ kind: "window", from: "2026-11-21", to: "2026-11-23" });
    expect(estimatedArrival({ status: "with_courier", confirmedAt, outForDeliveryAt: out }, new Date("2026-11-24T10:00:00Z"))).toEqual({ kind: "soon" });
  });
  it("uses the Israel day, not the UTC day", () => {
    // 23:30 UTC on Sat 14 Nov is already Sunday 15 Nov in Israel
    expect(estimatedArrival({ status: "confirmed", confirmedAt: "2026-11-14T23:30:00Z" }, new Date("2026-11-15T10:00:00Z"))).toEqual({ kind: "window", from: "2026-11-29", to: "2026-12-13" });
  });
  it("nothing when delivered or not confirmed", () => {
    expect(estimatedArrival({ status: "delivered", confirmedAt })).toBeNull();
    expect(estimatedArrival({ status: "awaiting_confirmation", confirmedAt: null })).toBeNull();
  });
});

describe("tracking stage", () => {
  const sample = {
    number: "97766951",
    track_info: {
      latest_status: { status: "InTransit", sub_status: "InTransit_Other" },
      tracking: { providers: [{ provider: { name: "Junhe" }, events: [
        { time_iso: "2026-11-12T20:00:00+02:00", description: "released from customs", location: "Israel" },
        { time_iso: "2026-11-12T22:02:00+02:00", description: "parcel prepared to be sent to pickup point", location: "Israel" },
        { time_iso: null, description: "" },
      ] }] },
    },
  };
  it("parses events newest first and skips empty ones", () => {
    const r = parseTrackInfo(sample)!;
    expect(r.status).toBe("InTransit");
    expect(r.events.map((e) => e.description)).toEqual(["parcel prepared to be sent to pickup point", "released from customs"]);
  });
  it("maps statuses to what happens to the orders", () => {
    expect(shipmentStage(null)).toBe("none");
    expect(shipmentStage({ status: "InfoReceived", events: [] })).toBe("none");
    expect(shipmentStage({ status: "NotFound", events: [] })).toBe("none");
    expect(shipmentStage({ status: "InTransit", events: [] })).toBe("shipped");
    expect(shipmentStage({ status: "AvailableForPickup", events: [] })).toBe("shipped");
    expect(shipmentStage({ status: "Delivered", events: [] })).toBe("received");
  });
  it("received time = the delivered event, never in the future", () => {
    const r = { status: "Delivered", subStatus: null, events: [{ time: "2026-11-13T09:00:00+02:00", description: "delivered", location: null }] };
    expect(receivedTime(r, new Date("2026-11-13T12:00:00Z")).toISOString()).toBe("2026-11-13T07:00:00.000Z");
    expect(receivedTime(r, new Date("2026-11-13T05:00:00Z")).toISOString()).toBe("2026-11-13T05:00:00.000Z");
    expect(parseTrackInfo(null)).toBeNull();
  });
});
