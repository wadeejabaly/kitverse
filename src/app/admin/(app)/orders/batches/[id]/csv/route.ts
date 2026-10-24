import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { batchLines, toCsv } from "@/lib/orders/admin";

export async function GET(_req: Request, ctx: RouteContext<"/admin/orders/batches/[id]/csv">) {
  await requireStaff();
  const { id } = await ctx.params;
  const itemIds = ((await db().from("supplier_batch_items").select("order_item_id").eq("batch_id", id)).data ?? []).map((r) => r.order_item_id);
  const orderIds = itemIds.length ? [...new Set(((await db().from("order_items").select("order_id").in("id", itemIds)).data ?? []).map((r) => r.order_id))] : [];
  const csv = toCsv(await batchLines(orderIds));
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kitverse-batch-${id.slice(0, 8)}.csv"` },
  });
}
