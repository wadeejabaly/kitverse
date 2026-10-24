import { describe, expect, it } from "vitest";
import { formatExamples } from "./voice";

describe("voice examples", () => {
  it("shows each owner bubble on its own line", () => {
    const out = formatExamples([{ situation: "price", customer_text: "قديش\nالبلوزة", owner_reply: "اهلًا\n110₪" }]);
    expect(out).toBe("Customer: قديش / البلوزة\nYou:\n  > اهلًا\n  > 110₪");
  });
});
