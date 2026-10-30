import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { moneyAmounts, allowedAmounts, unexpectedAmounts, toBubbles, isNoReply } from "./guard";
import { PriceListData } from "../pricing/schema";
import { quote } from "../pricing/engine";
import { recommendSize } from "./sizing";

const list = PriceListData.parse(JSON.parse(readFileSync("src/lib/pricing/fixture.price-list.json", "utf8")));

describe("money guard", () => {
  it("finds amounts in Arabic, Hebrew, English", () => {
    expect(moneyAmounts("كله 410₪ واصل")).toEqual([410]);
    expect(moneyAmounts("بس ٣٠٠ شيكل")).toEqual([300]);
    expect(moneyAmounts("₪ 95 fan, 110 ILS player")).toEqual([95, 110]);
  });
  it("allows list prices and the quote, blocks invented numbers", () => {
    const q = quote(list, { items: [1, 2, 3].map((k) => ({ key: String(k), title: "x", audience: "adult" as const, version: "player" as const, sleeve: "short" as const, era: "current" as const, size: "L", qty: 1, printNameNumber: true })), zoneId: "north" });
    const allowed = allowedAmounts(list, q);
    expect(unexpectedAmounts("300 البلايز / 60 الاسماء / 50 توصيل = 410₪", allowed)).toEqual([]);
    expect(unexpectedAmounts("بعملك ياها ب 390₪", allowed)).toEqual([390]);
    expect(unexpectedAmounts("النسخة الريترو 135₪", allowed)).toEqual([]);
  });
});

describe("meta-text guard", () => {
  it("catches internal text, lets normal replies through", async () => {
    const { looksLikeMeta } = await import("./guard");
    expect(looksLikeMeta("I'm out of tools for this turn")).toBe(true);
    expect(looksLikeMeta("Let me call get_quote first")).toBe(true);
    expect(looksLikeMeta("اهلًا خيا، أي وحدة عجبتك؟")).toBe(false);
    expect(looksLikeMeta("Hi! Which size do you usually wear?")).toBe(false);
  });
});

describe("reply extraction + language", () => {
  it("keeps only the <reply> block", async () => {
    const { extractReply, wrongLanguage } = await import("./guard");
    expect(extractReply("I'll check the sizes first.\n<reply>تمام خيا\n\nأي مقاس؟</reply>")).toEqual({ text: "تمام خيا\n\nأي مقاس؟", tagged: true });
    expect(extractReply("<reply><no_reply></reply>").text).toBe("<no_reply>");
    expect(extractReply("<reply>هلا خيا").text).toBe("هلا خيا");
    expect(extractReply("plain").tagged).toBe(false);
    expect(wrongLanguage("Aha, fine bro\nHere are the shirts", ["بدي السودة برشلونه"])).toBe(true);
    expect(wrongLanguage("MBAPPE 10\nتمام خيا، نسخة Player", ["بدي اسم امبابي"])).toBe(false);
    expect(wrongLanguage("Here are the shirts you asked for", ["hi how much is the shirt"])).toBe(false);
  });
});

describe("bubbles", () => {
  it("splits on blank lines, max 4", () => {
    expect(toBubbles("اهلا خيا\n\nتفضل")).toEqual(["اهلا خيا", "تفضل"]);
    expect(toBubbles("a\n\nb\n\nc\n\nd\n\ne")).toEqual(["a", "b", "c", "d\ne"]);
    expect(isNoReply(" <no_reply> ")).toBe(true);
  });
});

describe("sizing", () => {
  it("matches the owner's examples", () => {
    expect(recommendSize(177, 80, "player").recommended).toBe("L");
    expect(recommendSize(185, 96, "player").recommended).toBe("XXL");
  });
  it("matches the five real fit reports added 2026-11-02", () => {
    expect(recommendSize(177, 83, "fan").recommended).toBe("L"); // XL was a bit big
    expect(recommendSize(182, 62, "fan").recommended).toBe("M"); // fits well
    expect(recommendSize(185, 60, "fan").recommended).toBe("L"); // M was tight
    expect(recommendSize(192, 70, "fan").recommended).toBe("XXL"); // fits well
    expect(recommendSize(179, 85, "fan").recommended).toBe("XL");
  });
});
