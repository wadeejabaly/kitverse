import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

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

export async function POST(req: NextRequest) {
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
  try {
    await db().from("site_events").insert({
      type,
      session_id: sessionId,
      path: path ?? null,
      product_handle: productHandle ?? null,
      locale: locale ?? null,
      referrer_host: referrerHost ?? null,
    });
  } catch {
    // Never let a logging failure become the shopper's problem.
  }
  return NextResponse.json({ ok: true });
}
