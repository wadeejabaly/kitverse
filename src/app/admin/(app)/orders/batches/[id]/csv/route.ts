import { requireStaff } from "@/lib/auth";
import { batchOrderIds, batchLines, toCsv } from "@/lib/orders/admin";

export async function GET(_req: Request, ctx: RouteContext<"/admin/orders/batches/[id]/csv">) {
  await requireStaff();
  const { id } = await ctx.params;
  const orderIds = await batchOrderIds(id); // cancelled orders are left out
  const csv = toCsv(await batchLines(orderIds));
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kitverse-batch-${id.slice(0, 8)}.csv"` },
  });
}
