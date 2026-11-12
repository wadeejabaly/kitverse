import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ db: () => ({}) }));
vi.mock("../notify", () => ({ notify: async () => {} }));
vi.mock("../conversation/limits", () => ({ settings: async () => ({}) }));
import { dueItems, type ScheduledPost } from "./ig-publish";
import schedule from "@/data/ig-schedule.json";

const items: ScheduledPost[] = [
  { id: "a", at: "2026-11-13T12:00:00+02:00", kind: "story", image: "/x.jpg" },
  { id: "b", at: "2026-11-13T20:00:00+02:00", kind: "post", image: "/y.jpg", caption: "hi" },
];

describe("scheduled Instagram posts", () => {
  it("posts only what is due, and nothing more than 3 hours late", () => {
    expect(dueItems(items, new Date("2026-11-13T11:59:00+02:00"))).toEqual([]);
    expect(dueItems(items, new Date("2026-11-13T12:05:00+02:00")).map((i) => i.id)).toEqual(["a"]);
    expect(dueItems(items, new Date("2026-11-13T20:01:00+02:00")).map((i) => i.id)).toEqual(["b"]);
    expect(dueItems(items, new Date("2026-11-14T02:00:00+02:00"))).toEqual([]);
  });
  it("the real schedule: unique ids, a caption on every feed post, every image on disk", async () => {
    const { existsSync } = await import("node:fs");
    const s = schedule as ScheduledPost[];
    expect(new Set(s.map((i) => i.id)).size).toBe(s.length);
    for (const i of s) {
      if (i.kind === "post") expect(i.caption?.length).toBeGreaterThan(20);
      expect(existsSync(`public${i.image}`)).toBe(true);
      expect(Number.isNaN(Date.parse(i.at))).toBe(false);
    }
  });
});
