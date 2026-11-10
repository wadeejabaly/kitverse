import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Public, unauthenticated event sink for the storefront's own first-party traffic log
 * (src/lib/analytics/track.ts is what calls this - see its docstring, and the
 * site_events migration, for what this is and deliberately isn't). Every visitor can post
 * here, so the body is small and tightly validated and a failure here must never surface
 * to the shopper - sendBeacon/fetch calls into this are fire-and-forget.
 */
const Body = z.object({
  type: z.enum(["page_view", "add_to_cart", "checkout_start"]),
  sessionId: z.string().trim().min(1).max(100),
  path: z.string().trim().max(300).optional(),
  productHandle: z.string().trim().max(200).optional(),
  locale: z.string().trim().max(10).optional(),
  referrerHost: z.string().trim().max(200).optional(),
});

/** Only count events sent by our own pages (stops anyone else filling the table) and skip known bots. */
function fromOurSite(req: NextRequest): boolean {
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;
  let host: string;
  try { host = new URL(source).host; } catch { return false; }
  const ours = [req.headers.get("host"), (() => { try { return new URL(env().NEXT_PUBLIC_SITE_URL).host; } catch { return null; } })()];
  return ours.includes(host) && !/bot|crawl|spider|preview|headless/i.test(req.headers.get("user-agent") ?? "");
}

/** Vercel's edge attaches these to every request, resolved from the request IP - which we never
 *  see or store, only this coarse geo (owner decision 2026-11-10, see the location migration).
 *  Absent in local dev (no edge network in front of `next dev`), so every field is nullable. */
function geoFromHeaders(req: NextRequest): { country: string | null; countryRegion: string | null; city: string | null } {
  const country = req.headers.get("x-vercel-ip-country");
  const countryRegion = req.headers.get("x-vercel-ip-country-region");
  const rawCity = req.headers.get("x-vercel-ip-city");
  let city: string | null = null;
  if (rawCity) {
    try { city = decodeURIComponent(rawCity); } catch { city = rawCity; }
  }
  return { country, countryRegion, city };
}

export async function POST(req: NextRequest) {
  if (!fromOurSite(req)) return NextResponse.json({ ok: true }); // quietly ignored
  const raw = await req.text();
  if (raw.length > 2000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { type, sessionId, path, productHandle, locale, referrerHost } = parsed.data;
  const geo = geoFromHeaders(req);
  try {
    await db().from("site_events").insert({
      type,
      session_id: sessionId,
      path: path ?? null,
      product_handle: productHandle ?? null,
      locale: locale ?? null,
      referrer_host: referrerHost ?? null,
      country: geo.country,
      country_region: geo.countryRegion,
      city: geo.city,
    });
  } catch {
    // Never let a logging failure become the shopper's problem.
  }
  return NextResponse.json({ ok: true });
}
