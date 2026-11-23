import { describe, expect, it } from "vitest";
import { customerStage, daysSinceConfirmed } from "./customer-stage";

const confirmedAt = "2026-11-01T08:00:00Z"; // Sunday 1 Nov, Israel morning = day 0
const at = (ymd: string) => new Date(`${ymd}T10:00:00Z`);

describe("customerStage (owner timeline 2026-11-23)", () => {
  it("follows the days since confirmation", () => {
    const seen = (ymd: string) => customerStage({ status: "confirmed", confirmedAt }, at(ymd));
    expect(seen("2026-11-01")).toBe("received"); // day 0
    expect(seen("2026-11-03")).toBe("received"); // day 2
    expect(seen("2026-11-04")).toBe("production"); // day 3
    expect(seen("2026-11-07")).toBe("production"); // day 6
    expect(seen("2026-11-08")).toBe("produced"); // day 7
    expect(seen("2026-11-10")).toBe("produced"); // day 9
    expect(seen("2026-11-11")).toBe("to_warehouse"); // day 10
    expect(seen("2026-11-14")).toBe("to_warehouse"); // day 13
    expect(seen("2026-11-15")).toBe("at_warehouse"); // day 14
    expect(seen("2026-11-18")).toBe("at_warehouse"); // day 17
    expect(seen("2026-11-19")).toBe("with_courier"); // day 18
    expect(seen("2027-01-30")).toBe("with_courier"); // stays until marked delivered
  });
  it("delivered only when the owner marks it", () => {
    expect(customerStage({ status: "delivered", confirmedAt }, at("2026-11-02"))).toBe("delivered");
  });
  it("a status set further by hand is shown, never behind", () => {
    expect(customerStage({ status: "with_courier", confirmedAt }, at("2026-11-05"))).toBe("with_courier");
    expect(customerStage({ status: "in_supplier_batch", confirmedAt }, at("2026-11-12"))).toBe("to_warehouse");
  });
  it("nothing for unconfirmed, cancelled or issue orders", () => {
    expect(customerStage({ status: "awaiting_confirmation", confirmedAt: null })).toBeNull();
    expect(customerStage({ status: "cancelled", confirmedAt })).toBeNull();
    expect(customerStage({ status: "issue", confirmedAt })).toBeNull();
  });
  it("counts Israel days", () => {
    // 23:30 UTC Sat 31 Oct is already Sunday 1 Nov in Israel
    expect(daysSinceConfirmed("2026-10-31T23:30:00Z", at("2026-11-01"))).toBe(0);
  });
});
