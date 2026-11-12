import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Check } from "lucide-react";
import { db } from "@/lib/db";
import { batchOrderIds, batchLines } from "@/lib/orders/admin";
import { patchesText } from "@/lib/orders/supplier-sheet";
import { markBatchSent } from "../../../../orders-actions";
import { PageHeader, Card, Badge, button } from "../../../../ui";
import { SubmitButton } from "../../../../submit-button";

export const dynamic = "force-dynamic";

export default async function Batch({ params }: PageProps<"/admin/orders/batches/[id]">) {
  const { id } = await params;
  const b = (await db().from("supplier_batches").select("id,status,sent_at").eq("id", id).maybeSingle()).data;
  if (!b) notFound();
  const orderIds = await batchOrderIds(id); // cancelled orders are left out
  const lines = await batchLines(orderIds);
  return (
    <>
      <Link href="/admin/orders/batches" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Batches</Link>
      <PageHeader eyebrow="Sales" title="Supplier batch" subtitle={`${lines.length} lines from ${orderIds.length} order${orderIds.length === 1 ? "" : "s"}. Download the Excel (shirt photo + 3 empty cells per shirt for your own pictures), add your pictures, send it on WhatsApp, then mark it sent.`}
        actions={<>
          <a href={`/admin/orders/batches/${id}/xlsx`} className={button.primary}><Download className="h-4 w-4" /> Download Excel</a>
          <a href={`/admin/orders/batches/${id}/csv`} className={button.ghost}>CSV</a>
          {b.status !== "sent" ? <form action={markBatchSent}><input type="hidden" name="batchId" value={id} /><SubmitButton bare className={button.ghost}><Check className="h-4 w-4" /> Mark as sent</SubmitButton></form> : <Badge tone="green">Sent</Badge>}
        </>} />
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3 font-medium">Order</th><th className="px-4 py-3 font-medium">Photo</th><th className="px-4 py-3 font-medium">Shirt</th><th className="px-4 py-3 font-medium">Version</th><th className="px-4 py-3 font-medium">Size</th><th className="px-4 py-3 font-medium">Print</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-4 py-3 tabular-nums">#{l.order_number}</td>
                <td className="px-4 py-2">{l.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail; links to the full photo so it can be saved for WhatsApp
                  <a href={l.photo} target="_blank" rel="noreferrer"><img src={l.photo} alt="" className="h-14 w-14 rounded-md bg-white object-contain" /></a>
                ) : <span className="text-muted">-</span>}</td>
                <td className="px-4 py-3">{l.title}</td>
                <td className="px-4 py-3 text-muted">{l.version} · {l.sleeve}</td>
                <td className="px-4 py-3 font-medium">{l.size}{l.qty > 1 ? ` ×${l.qty}` : ""}</td>
                <td className="px-4 py-3">{[l.print_name, l.print_number].filter(Boolean).join(" ") || <span className="text-muted">-</span>}{l.patch_ids.length || l.box ? <span className="text-muted"> · {patchesText(l)}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
