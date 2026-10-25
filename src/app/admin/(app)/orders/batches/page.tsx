import Link from "next/link";
import { ArrowLeft, Truck, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge, EmptyState, ilTime } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function Batches() {
  const { data } = await db().from("supplier_batches").select("id,status,sent_at,created_at,items:supplier_batch_items(item:order_items(qty))").order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as { id: string; status: string; sent_at: string | null; created_at: string; items: { item: { qty: number } | null }[] }[];
  return (
    <>
      <Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Orders</Link>
      <PageHeader title="Supplier batches" subtitle="Each batch is one spreadsheet you send the supplier on WhatsApp." />
      {!rows.length ? <EmptyState icon={Truck} title="No batches yet" text="Create one from the Orders page." /> : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {rows.map((b) => (
            <Link key={b.id} href={`/admin/orders/batches/${b.id}`} className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-raised sm:px-5">
              <Truck className="h-4 w-4 text-muted" />
              <span>{ilTime(b.created_at)}</span>
              <span className="text-muted">{b.items.reduce((n, i) => n + (i.item?.qty ?? 0), 0)} shirts</span>
              <Badge tone={b.status === "sent" ? "green" : "amber"} className="ml-auto">{b.status === "sent" ? "Sent" : "Not sent yet"}</Badge>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
