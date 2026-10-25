import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveTown } from "@/lib/localities";
import { currentPriceList } from "@/lib/pricing/load";

const Body = z.object({ city: z.string().trim().min(2).max(80) });

/**
 * Live shipping preview as the shopper types their city — the same town list
 * the Instagram bot resolves against (src/lib/localities.ts). This is a
 * preview only: the order itself is always re-priced server-side in
 * src/lib/orders/web.ts, which never trusts a zone the browser sent.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 2_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const resolved = await resolveTown(parsed.data.city);
  if (!resolved) return NextResponse.json({ ok: true, found: false });

  const list = await currentPriceList();
  const zone = list.data.delivery.zones.find((z) => z.id === resolved.locality.zone_id);
  if (!zone) return NextResponse.json({ ok: true, found: false });

  return NextResponse.json({ ok: true, found: true, zoneId: zone.id, fee: zone.fee, label: zone.name_ar, days: zone.days });
}
