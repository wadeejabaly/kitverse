import { NextResponse } from "next/server";
import { getManualPayConfig } from "@/lib/orders/manual-pay";

export const dynamic = "force-dynamic";

/**
 * Which hand-verified methods (personal Bit, PayPal.Me) checkout should offer
 * right now. The checkout page is static, and the owner switches these on and
 * off in admin Settings without a deploy, so the page asks at runtime. Only
 * on/off is returned here - the phone number / username appear on the pay
 * page of a placed order, not to every visitor of /checkout.
 */
export async function GET() {
  try {
    const cfg = await getManualPayConfig();
    return NextResponse.json({ bitPersonal: cfg.bit.enabled, paypalMe: cfg.paypalMe.enabled }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("manual methods lookup failed", (e as Error).message);
    return NextResponse.json({ bitPersonal: false, paypalMe: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
