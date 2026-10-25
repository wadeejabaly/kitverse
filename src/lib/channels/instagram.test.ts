import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseWebhook, verifySignature } from "./instagram";

const entry = (messaging: unknown[]) => ({ object: "instagram", entry: [{ id: "IGBIZ", time: 1, messaging }] });

describe("instagram webhook", () => {
  it("verifies the X-Hub-Signature-256 header", () => {
    const body = JSON.stringify(entry([]));
    const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifySignature(body, sig, "secret")).toBe(true);
    expect(verifySignature(body, sig, "other")).toBe(false);
    expect(verifySignature(body + " ", sig, "secret")).toBe(false);
    expect(verifySignature(body, null, "secret")).toBe(false);
    expect(verifySignature(body, "sha256=zz", "secret")).toBe(false);
  });

  it("parses text, story replies, images, ad referrals, reactions and echoes", () => {
    const evs = parseWebhook(entry([
      { sender: { id: "U1" }, recipient: { id: "IGBIZ" }, timestamp: 10, message: { mid: "m1", text: "قديش؟" } },
      { sender: { id: "U1" }, recipient: { id: "IGBIZ" }, timestamp: 11, message: { mid: "m2", text: "هاي؟", reply_to: { story: { id: "S1", url: "https://cdn/s.jpg" } } } },
      { sender: { id: "U1" }, recipient: { id: "IGBIZ" }, timestamp: 12, message: { mid: "m3", attachments: [{ type: "image", payload: { url: "https://cdn/i.jpg" } }] } },
      { sender: { id: "U2" }, recipient: { id: "IGBIZ" }, timestamp: 13, message: { mid: "m4", text: "كيف يمكنني الطلب؟", referral: { ad_id: "AD9", source: "ADS", ads_context_data: { ad_title: "3 ب 300" } } } },
      { sender: { id: "U1" }, recipient: { id: "IGBIZ" }, timestamp: 14, reaction: { mid: "m0", action: "react", reaction: "love", emoji: "❤️" } },
      { sender: { id: "IGBIZ" }, recipient: { id: "U1" }, timestamp: 15, message: { mid: "m5", text: "هلا خيا", is_echo: true } },
      { sender: { id: "U1" }, recipient: { id: "IGBIZ" }, timestamp: 16, read: { mid: "m5" } },
    ]));
    expect(evs.map((e) => e.type)).toEqual(["message", "message", "message", "message", "reaction", "echo", "read"]);
    expect(evs[1].replyToStory).toEqual({ id: "S1", url: "https://cdn/s.jpg" });
    expect(evs[2].attachments?.[0]).toMatchObject({ type: "image", url: "https://cdn/i.jpg" });
    expect(evs[3].referral).toMatchObject({ ad_id: "AD9", ad_title: "3 ب 300" });
    expect(evs[4].reaction?.emoji).toBe("❤️");
    expect(evs[5]).toMatchObject({ senderId: "IGBIZ", recipientId: "U1", text: "هلا خيا" });
  });

  it("ignores empty payloads", () => {
    expect(parseWebhook({})).toEqual([]);
  });
  it("reads messages wrapped as entry.changes (Instagram Login webhooks)", () => {
    const evs = parseWebhook({ object: "instagram", entry: [{ id: "1", time: 1, changes: [{ field: "messages", value: { sender: { id: "u1" }, recipient: { id: "b1" }, timestamp: 5, message: { mid: "m1", text: "kvtest" } } }] }] });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: "message", senderId: "u1", text: "kvtest" });
    expect(parseWebhook(null)).toEqual([]);
  });
});
