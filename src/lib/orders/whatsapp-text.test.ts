import { describe, expect, it } from "vitest";
import { waKindFor, waLangFor, waLink, waMessage, waPhone } from "./whatsapp-text";

const order = { name: "Ahmad Khalil", number: 1021, link: "https://www.kitversejerseys.com/o/abc.def", eta: { from: "2026-11-29", to: "2026-12-13" }, codAmount: "₪250" };

describe("whatsapp order messages", () => {
  it("picks the message for the status", () => {
    expect(waKindFor("confirmed")).toBe("thanks");
    expect(waKindFor("in_supplier_batch")).toBe("thanks");
    expect(waKindFor("produced")).toBe("packed");
    expect(waKindFor("with_courier")).toBe("out_for_delivery");
    expect(waKindFor("delivered")).toBe("delivered");
    expect(waKindFor("awaiting_confirmation")).toBeNull();
  });
  it("thanks: first name, order number, dates, cash amount and the order link", () => {
    const en = waMessage("thanks", "en", order);
    expect(en).toContain("Hi Ahmad");
    expect(en).toContain("#1021");
    expect(en).toContain("Estimated arrival: 29 November – 13 December");
    expect(en).toContain("To pay on delivery: ₪250");
    expect(en).toContain(order.link);
    const ar = waMessage("thanks", "ar", order);
    expect(ar).toContain("أهلين Ahmad");
    expect(ar).toContain("الوصول المتوقع: 29 نوفمبر – 13 ديسمبر");
  });
  it("out for delivery says 24-72 hours, delivered has no link or amount", () => {
    expect(waMessage("out_for_delivery", "he", order)).toContain("24-72");
    const d = waMessage("delivered", "en", order);
    expect(d).not.toContain(order.link);
    expect(d).not.toContain("₪250");
  });
  it("'soon' and no estimate", () => {
    expect(waMessage("packed", "en", { ...order, eta: "soon" })).toContain("in the next few days");
    expect(waMessage("thanks", "en", { ...order, eta: null, codAmount: null })).not.toMatch(/Estimated|pay on delivery/);
  });
  it("Hebrew name -> Hebrew, anything else -> Arabic", () => {
    expect(waLangFor("יוסי כהן")).toBe("he");
    expect(waLangFor("أحمد خليل")).toBe("ar");
    expect(waLangFor("Ahmad Khalil")).toBe("ar");
    expect(waLangFor(null)).toBe("ar");
  });
  it("Israeli phones -> wa.me digits", () => {
    expect(waPhone("050-123-4567")).toBe("972501234567");
    expect(waPhone("+972 50 123 4567")).toBe("972501234567");
    expect(waPhone("0521234567")).toBe("972521234567");
    expect(waPhone("")).toBeNull();
    expect(waPhone("123")).toBeNull();
    expect(waLink("972501234567", "hi there")).toBe("https://wa.me/972501234567?text=hi%20there");
  });
});
