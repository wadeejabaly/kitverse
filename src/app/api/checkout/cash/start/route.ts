import { NextResponse, type NextRequest } from "next/server";
import { CreateOrderRequestSchema, type CheckoutErrorBody } from "@/lib/checkout";
import { createWebOrder } from "@/lib/orders/web";

/** Website checkout, cash on delivery: creates a confirmed order in the shared orders table and alerts the owner. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 50_000) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 }); }
  const parsed = CreateOrderRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json<CheckoutErrorBody>({ code: "invalid_request" }, { status: 400 });

  const r = await createWebOrder(parsed.data);
  if (!r.ok) {
    if (r.code === "server_error") console.error("website order failed", r.detail);
    return NextResponse.json<CheckoutErrorBody>({ code: r.code }, { status: r.code === "server_error" ? 500 : 400 });
  }
  return NextResponse.json({ reference: String(r.number), token: r.token });
}
