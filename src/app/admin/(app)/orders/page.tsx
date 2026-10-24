import Link from "next/link";
import { Package, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { createSupplierBatch } from "../../orders-actions";
import { PageHeader, Card, Badge, EmptyState, ORDER_STATUS, button, cx, ilTime } from "../../ui";

export const dynamic = "force-dynamic";

export default async function Orders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "open";
  let q = db().from("orders").select("id,number,status,total,payment_method,confirmed_at,address,customer:customers(ig_user_id)")
    .not("status", "in", "(draft,quoted,awaiting_details,awaiting_confirmation)").order("confirmed_at", { ascending: false }).limit(100);
  if (status === "open") q = q.not("status", "in", "(delivered,cancelled)");
  else if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as { id: string; number: number; status: string; total: number; payment_method: string | null; confirmed_at: string | null; address: { full_name?: string; town?: string } | null; customer: { ig_user_id: string | null } }[];
  const batchable = rows.some((r) => r.status === "confirmed" || r.status === "paid");
  const tabs = [["open", "Open"], ["confirmed", "New"], ["with_courier", "With courier"], ["all", "All"]];

  return (
    <>
      <PageHeader title="Orders" subtitle="Orders the bot confirmed. Tick new ones to send to the supplier."
        actions={<Link href="/admin/orders/batches" className={button.ghost}><Truck className="h-4 w-4" /> Supplier batches</Link>} />
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1 text-sm">
        {tabs.map(([f, label]) => <Link key={f} href={`/admin/orders?status=${f}`} className={cx("rounded-lg px-3 py-1.5", status === f ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>{label}</Link>)}
      </div>
      {!rows.length ? <EmptyState icon={Package} title="No orders here" text="Confirmed orders from Instagram show up here." /> : (
        <form action={createSupplierBatch} className="flex flex-col gap-3">
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            {rows.map((o) => {
              const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.draft;
              const canBatch = o.status === "confirmed" || o.status === "paid";
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  {canBatch ? <input type="checkbox" name="orderId" value={o.id} defaultChecked className="h-4 w-4 accent-[var(--pitch)]" aria-label={`Select order ${o.number}`} /> : <span className="w-4" />}
                  <Link href={`/admin/orders/${o.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">#{o.number}</span>
                        <span className="truncate text-sm" dir="auto">{o.address?.full_name ?? ""}</span>
                        {o.customer?.ig_user_id?.startsWith("sim:") ? <Badge>test</Badge> : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span dir="auto">{o.address?.town ?? ""}</span>·<span>{o.payment_method === "paypal" ? "PayPal" : "Cash"}</span>{o.confirmed_at ? <>·<span>{ilTime(o.confirmed_at)}</span></> : null}
                      </div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="w-16 text-right font-medium tabular-nums">₪{o.total / 100}</span>
                  </Link>
                </div>
              );
            })}
          </Card>
          {batchable ? <button className={`${button.primary} self-start`}><Truck className="h-4 w-4" /> Create supplier batch from selected</button> : null}
        </form>
      )}
    </>
  );
}
