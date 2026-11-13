import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Check, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { batchOrderIds, batchLines } from "@/lib/orders/admin";
import { patchesText } from "@/lib/orders/supplier-sheet";
import { checkTrackingNow, markBatchSent, markShipmentReceived } from "../../../../orders-actions";
import { STATUS_LABEL } from "@/lib/orders/admin";
import { trackingEnabled } from "@/lib/tracking/track17";
import { DELIVERED_AFTER_DAYS, type TrackEvent } from "@/lib/tracking/stage";
import { TrackingNumberForm } from "./tracking";
import { PageHeader, Card, Badge, SectionTitle, button, type Tone } from "../../../../ui";
import { SubmitButton } from "../../../../submit-button";

export const dynamic = "force-dynamic";

export default async function Batch({ params }: PageProps<"/admin/orders/batches/[id]">) {
  const { id } = await params;
  const b = (await db().from("supplier_batches").select("id,status,sent_at,tracking_number,tracking_status,tracking_events,tracking_checked_at,tracking_error,shipped_at,received_at").eq("id", id).maybeSingle()).data as
    { id: string; status: string; sent_at: string | null; tracking_number: string | null; tracking_status: string | null; tracking_events: TrackEvent[] | null; tracking_checked_at: string | null; tracking_error: string | null; shipped_at: string | null; received_at: string | null } | null;
  if (!b) notFound();
  const orderIds = await batchOrderIds(id); // cancelled orders are left out
  const lines = await batchLines(orderIds);
  const orderStatuses = orderIds.length ? (((await db().from("orders").select("status").in("id", orderIds)).data) ?? []) as { status: string }[] : [];
  const statusCounts = Object.entries(orderStatuses.reduce<Record<string, number>>((m, o) => ({ ...m, [o.status]: (m[o.status] ?? 0) + 1 }), {}));
  const tracking = trackingEnabled();
  const events = b.tracking_events ?? [];
  const deliveredOn = b.received_at ? new Date(new Date(b.received_at).getTime() + DELIVERED_AFTER_DAYS * 86_400_000) : null;
  return (
    <>
      <Link href="/admin/orders/batches" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Batches</Link>
      <PageHeader eyebrow="Sales" title="Supplier batch" subtitle={`${lines.length} lines from ${orderIds.length} order${orderIds.length === 1 ? "" : "s"}. Download the Excel (shirt photo + 3 empty cells per shirt for your own pictures), add your pictures, send it on WhatsApp, then mark it sent.`}
        actions={<>
          <a href={`/admin/orders/batches/${id}/xlsx`} className={button.primary}><Download className="h-4 w-4" /> Download Excel</a>
          <a href={`/admin/orders/batches/${id}/csv`} className={button.ghost}>CSV</a>
          {b.status !== "sent" ? <form action={markBatchSent}><input type="hidden" name="batchId" value={id} /><SubmitButton bare className={button.ghost}><Check className="h-4 w-4" /> Mark as sent</SubmitButton></form> : <Badge tone="green">Sent</Badge>}
        </>} />
      <Card className="mb-4" accent={b.received_at ? "green" : b.shipped_at ? "blue" : undefined}>
        <SectionTitle action={b.tracking_number && tracking ? (
          <form action={checkTrackingNow}><input type="hidden" name="batchId" value={id} /><SubmitButton bare className={button.subtle}><RefreshCw className="h-3.5 w-3.5" /> Check now</SubmitButton></form>
        ) : null}><span className="inline-flex items-center gap-2"><Truck className="h-4 w-4" /> Shipment tracking</span></SectionTitle>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-4">
            <TrackingNumberForm batchId={id} current={b.tracking_number} />
            {!tracking ? <p className="text-xs text-amber">Automatic tracking is off until the 17TRACK key (TRACK17_API_KEY) is added. You can still use “I received this shipment”.</p> : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Tracking</dt><dd>{b.tracking_status ? <Badge tone={TRACK_TONE[b.tracking_status] ?? "neutral"}>{TRACK_LABEL[b.tracking_status] ?? b.tracking_status}</Badge> : <span className="text-muted">-</span>}</dd>
              <dt className="text-muted">Left the supplier</dt><dd>{when(b.shipped_at)}</dd>
              <dt className="text-muted">You received it</dt><dd>{when(b.received_at)}</dd>
              <dt className="text-muted">Marked delivered</dt><dd>{deliveredOn ? when(deliveredOn.toISOString()) : <span className="text-muted">{DELIVERED_AFTER_DAYS} days after you receive it</span>}</dd>
              <dt className="text-muted">Orders</dt><dd className="flex flex-wrap gap-1">{statusCounts.length ? statusCounts.map(([s, n]) => <Badge key={s}>{n} {STATUS_LABEL[s]?.[1] ?? s}</Badge>) : <span className="text-muted">-</span>}</dd>
              {b.tracking_checked_at ? <><dt className="text-muted">Last checked</dt><dd className="text-muted">{when(b.tracking_checked_at)}</dd></> : null}
            </dl>
            {b.tracking_error ? <p className="text-sm text-red">17TRACK: {b.tracking_error}</p> : null}
            {!b.received_at ? (
              <form action={markShipmentReceived}><input type="hidden" name="batchId" value={id} /><SubmitButton bare className={button.ghost}><PackageCheck className="h-4 w-4" /> I received this shipment</SubmitButton></form>
            ) : null}
            <p className="text-xs text-muted">Customers only see “preparing for production”, “being packed and sent to our warehouse for a quality check”, “being delivered (24-72 hours)” and “delivered”, with an estimated arrival date - never the tracking number or Junhe.</p>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-ink-2">Tracking events</div>
            {events.length ? (
              <ol className="relative grid gap-3 border-s border-line-2 ps-4">
                {events.map((e, i) => (
                  <li key={i} className="text-sm">
                    <span className={`absolute -start-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-pitch-fill" : "bg-line-2"}`} />
                    <div className={i === 0 ? "font-semibold text-ink" : "text-ink-2"}>{e.description}</div>
                    <div className="text-xs text-muted">{[e.location, e.time ? when(e.time) : null].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">{b.tracking_number ? "No events yet." : "Add the tracking number once the supplier ships."}</p>}
          </div>
        </div>
      </Card>
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

const TRACK_LABEL: Record<string, string> = {
  NotFound: "Not found yet", InfoReceived: "Label created", InTransit: "In transit", Expired: "Expired", AvailableForPickup: "At pickup point",
  OutForDelivery: "Out for delivery", DeliveryFailure: "Delivery failed", Delivered: "Delivered to you", Exception: "Problem",
};
const TRACK_TONE: Record<string, Tone> = { InTransit: "blue", AvailableForPickup: "blue", OutForDelivery: "blue", Delivered: "green", DeliveryFailure: "red", Exception: "red", Expired: "amber" };

function when(iso: string | null) {
  if (!iso) return <span className="text-muted">-</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
