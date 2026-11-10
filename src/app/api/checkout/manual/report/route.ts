import { NextResponse, type NextRequest } from "next/server";
import { readOrderToken } from "@/lib/orders/link";
import { reportManualPayment } from "@/lib/orders/manual-pay";
import { cleanReference, MAX_PROOF_BYTES, sniffImage } from "@/lib/manual-pay-core";

/**
 * The customer's "I've paid" on the pay page: a reference and/or a
 * screenshot (multipart form). Only the holder of the order's signed token
 * can report, only once, and a report NEVER marks the order paid - it waits
 * for the owner (src/lib/orders/manual-pay.ts).
 */
export async function POST(req: NextRequest) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PROOF_BYTES + 64 * 1024) return NextResponse.json({ code: "too_large" }, { status: 413 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ code: "invalid_request" }, { status: 400 }); }

  const orderId = readOrderToken(String(form.get("t") ?? ""));
  if (!orderId) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const reference = cleanReference(form.get("reference"));

  let proof: { bytes: Uint8Array; mime: string; ext: string } | undefined;
  const file = form.get("proof");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > MAX_PROOF_BYTES) return NextResponse.json({ code: "too_large" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return NextResponse.json({ code: "not_image" }, { status: 400 });
    proof = { bytes, ...kind };
  }

  const r = await reportManualPayment(orderId, { reference, proof });
  if (!r.ok) {
    const status = r.code === "not_found" ? 404 : r.code === "server_error" ? 500 : r.code === "empty" ? 400 : 409;
    return NextResponse.json({ code: r.code }, { status });
  }
  return NextResponse.json({ ok: true });
}
