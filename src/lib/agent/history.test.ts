import { describe, expect, it } from "vitest";
import { toApiMessages, type MessageRow } from "./history";

const row = (p: Partial<MessageRow>): MessageRow => ({
  id: "x", direction: "in", sender: "customer", kind: "text", text: null, transcript: null, media: null,
  ig_media_id: null, product_ids: [], status: "received", created_at: "2026-10-25T15:00:00Z", ...p,
});
const texts = (m: ReturnType<typeof toApiMessages>[number]) => (m.content as { type: string; text?: string }[]).map((b) => b.text);

describe("replies and reactions in history", () => {
  const titles = new Map([["P1", "برشلونة اساسي"]]);
  const photo = row({ direction: "out", sender: "bot", kind: "image", product_ids: ["P1"], ig_message_id: "m-photo", status: "sent" });

  it("tells the bot which photo the customer swiped to reply to", () => {
    const reply = row({ text: "على هاي", reply_to_ig_message_id: "m-photo", reply_to: photo });
    const out = toApiMessages([row({ text: "بدي بلوزة برشا" }), photo, reply], titles);
    expect(texts(out[2])).toEqual(["[replying to your photo of برشلونة اساسي (product_id P1)]", "على هاي"]);
  });

  it("names the message a reaction was on", () => {
    const ask = row({ direction: "out", sender: "bot", text: "نثبت الطلبية؟", ig_message_id: "m-ask", status: "sent" });
    const like = row({ kind: "reaction", media: [{ emoji: "👍" }], reply_to_ig_message_id: "m-ask", reply_to: ask });
    const out = toApiMessages([row({ text: "تمام" }), ask, like], titles);
    expect(texts(out[2])).toEqual(['[reacted 👍 to your message "نثبت الطلبية؟"]']);
  });

  it("still says it is a reply when the original is unknown", () => {
    const out = toApiMessages([row({ text: "هاي", reply_to_ig_message_id: "m-gone", reply_to: null })], titles);
    expect(texts(out[0])).toEqual(["[replying to an earlier message]", "هاي"]);
  });
});
