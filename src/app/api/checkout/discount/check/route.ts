import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findActiveDiscountCode } from "@/lib/discounts";
import { isSaleRow } from "@/lib/discount-rules";

const Body = z.object({ code: z.string().trim().min(1).max(40) });

/**
 * Live discount-code preview as the shopper types one at checkout — the same
 * "preview only" pattern as resolve-city: the real order is always
 * re-validated and re-priced server-side in src/lib/orders/web.ts, which
 * never trusts anything the browser says a code is worth.
 *
 * `value` and `minOrder` are converted from agorot to ILS here (for a
 * 'fixed' code) so the browser can do the same plain-ILS math it already
 * does for the rest of the cart in src/data/pricing.ts.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 500) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });

  const lookup = await findActiveDiscountCode(parsed.data.code);
  if (!lookup.ok) return NextResponse.json({ ok: false, reason: lookup.reason });

  const { kind, value, min_order, stackable, first_order_only, applies_to } = lookup.row;
  return NextResponse.json({
    ok: true,
    kind,
    value: kind === "fixed" ? value / 100 : value,
    minOrder: min_order / 100,
    stackable,
    // Shown next to the applied code; the real check (by phone) happens when the order is placed.
    firstOrderOnly: first_order_only === true,
    // owner 2026-11-15: a "shirts" code is only taken off the shirts' and kits' own price
    appliesTo: applies_to === "shirts" ? "shirts" : "order",
    // owner 2026-11-16: the riddle coupon may join the running sale code (src/lib/discount-rules.ts)
    combinesWithSale: lookup.row.combines_with_sale === true,
    isSale: isSaleRow(lookup.row),
    // owner 2026-11-21: the code also makes delivery free (KV25)
    freeDelivery: lookup.row.free_delivery === true,
  });
}
