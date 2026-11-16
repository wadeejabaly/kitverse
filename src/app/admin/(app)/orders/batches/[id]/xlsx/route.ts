import { requireStaff } from "@/lib/auth";
import { batchOrderIds, batchLines } from "@/lib/orders/admin";
import { buildSupplierSheet, sheetLang } from "@/lib/orders/supplier-sheet";

export const runtime = "nodejs";
export const maxDuration = 60; // fetches every shirt + patch picture once

/** The supplier's picture sheet (owner request 2026-11-12) - see src/lib/orders/supplier-sheet.ts. */
export async function GET(req: Request, ctx: RouteContext<"/admin/orders/batches/[id]/xlsx">) {
  await requireStaff();
  const { id } = await ctx.params;
  const orderIds = await batchOrderIds(id); // cancelled orders are left out
  const url = new URL(req.url);
  const lang = sheetLang(url.searchParams.get("lang")); // ?lang=zh = Chinese for the supplier (owner 2026-11-17)
  const buf = await buildSupplierSheet(await batchLines(orderIds), url.origin, lang);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kitverse-batch-${id.slice(0, 8)}${lang === "zh" ? "-zh" : ""}.xlsx"`,
    },
  });
}
