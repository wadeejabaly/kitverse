import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Check } from "lucide-react";
import { db } from "@/lib/db";
import { batchLines } from "@/lib/orders/admin";
import { markBatchSent } from "../../../../orders-actions";
import { PageHeader, Card, Badge, button } from "../../../../ui";

export const dynamic = "force-dynamic";

export default async function Batch({ params }: PageProps<"/admin/orders/batches/[id]">) {
  const { id } = await params;
  const b = (await db().from("supplier_batches").select("id,status,sent_at").eq("id", id).maybeSingle()).data;
  if (!b) notFound();
  const itemIds = ((await db().from("supplier_batch_items").select("order_item_id").eq("batch_id", id)).data ?? []).map((r) => r.order_item_id);
  const orderIds = itemIds.length ? [...new Set(((await db().from("order_items").select("order_id").in("id", itemIds)).data ?? []).map((r) => r.order_id))] : [];
  const lines = await batchLines(orderIds);
  return (
    <>
      <Link href="/admin/orders/batches" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Batches</Link>
      <PageHeader title="Supplier batch" subtitle={`${lines.length} lines from ${orderIds.length} order${orderIds.length === 1 ? "" : "s"}. Download the sheet, send it on WhatsApp, then mark it sent.`}
        actions={<>
          <a href={`/admin/orders/batches/${id}/csv`} className={button.primary}><Download className="h-4 w-4" /> Download sheet</a>
          {b.status !== "sent" ? <form action={markBatchSent}><input type="hidden" name="batchId" value={id} /><button className={button.ghost}><Check className="h-4 w-4" /> Mark as sent</button></form> : <Badge tone="green">Sent</Badge>}
        </>} />
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3 font-medium">Order</th><th className="px-4 py-3 font-medium">Shirt</th><th className="px-4 py-3 font-medium">Version</th><th className="px-4 py-3 font-medium">Size</th><th className="px-4 py-3 font-medium">Print</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-4 py-3 tabular-nums">#{l.order_number}</td>
                <td className="px-4 py-3">{l.title}</td>
                <td className="px-4 py-3 text-muted">{l.version} · {l.sleeve}</td>
                <td className="px-4 py-3 font-medium">{l.size}{l.qty > 1 ? ` ×${l.qty}` : ""}</td>
                <td className="px-4 py-3">{[l.print_name, l.print_number].filter(Boolean).join(" ") || <span className="text-muted">-</span>}{l.patches ? <span className="text-muted"> · {l.patches}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
