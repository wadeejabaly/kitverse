import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findActiveDiscountCode } from "@/lib/discounts";

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

  const { kind, value, min_order } = lookup.row;
  return NextResponse.json({
    ok: true,
    kind,
    value: kind === "fixed" ? value / 100 : value,
    minOrder: min_order / 100,
  });
}
