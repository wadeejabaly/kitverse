import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare, Phone, MapPin, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { STATUS_MESSAGE, batchLines } from "@/lib/orders/admin";
import { orderToken } from "@/lib/orders/link";
import { changeOrderStatus } from "../../../orders-actions";
import { PageHeader, Card, Badge, SectionTitle, button, input, ORDER_STATUS, ilTime } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const o = (await db().from("orders").select("*").eq("id", id).maybeSingle()).data as
    { id: string; number: number; status: string; total: number; conversation_id: string | null; payment_method: string | null; address: Record<string, string | null> | null; quote: { summaryAr?: string } | null } | null;
  if (!o) notFound();
  const lines = await batchLines([o.id]);
  const events = (await db().from("order_events").select("from_status,to_status,actor,note,created_at").eq("order_id", o.id).order("created_at")).data ?? [];
  const a = o.address ?? {};
  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.draft;
  const next = ["confirmed", "in_supplier_batch", "produced", "at_warehouse", "with_courier", "delivered", "issue", "cancelled"];
  const msgLabels: Record<string, string> = { produced: "Produced", at_warehouse: "At warehouse", with_courier: "With courier" };

  return (
    <>
      <Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Orders</Link>
      <PageHeader title={`Order #${o.number}`} subtitle={<span className="inline-flex items-center gap-2"><Badge tone={st.tone}>{st.label}</Badge><span>₪{o.total / 100} · {o.payment_method === "paypal" ? "PayPal" : "Cash on delivery"}</span></span>}
        actions={<>
          <a href={`/o/${orderToken(o.id)}`} target="_blank" rel="noreferrer" className={button.ghost}><ExternalLink className="h-4 w-4" /> Customer page</a>
          {o.conversation_id ? <Link href={`/admin/inbox/${o.conversation_id}`} className={button.ghost}><MessagesSquare className="h-4 w-4" /> Chat</Link> : null}
        </>} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>Shirts</SectionTitle>
            <div className="divide-y divide-line">
              {lines.map((l, i) => (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{l.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>{l.version}</Badge><Badge>{l.sleeve} sleeve</Badge><Badge tone="ink">{l.size}</Badge>{l.qty > 1 ? <Badge>×{l.qty}</Badge> : null}
                      {l.print_name || l.print_number ? <Badge tone="green">{[l.print_name, l.print_number].filter(Boolean).join(" ")}</Badge> : null}
                      {l.patches ? <Badge>{l.patches}</Badge> : null}{l.box ? <Badge>gift box</Badge> : null}
                    </div>
                  </div>
                  {l.supplier_album ? <a href={l.supplier_album} target="_blank" rel="noreferrer" className={button.subtle} aria-label="Supplier album"><ExternalLink className="h-4 w-4" /></a> : null}
                </div>
              ))}
            </div>
            {o.quote?.summaryAr ? <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm text-ink-2" dir="auto">{o.quote.summaryAr}</p> : null}
          </Card>
          <Card>
            <SectionTitle>History</SectionTitle>
            <ol className="flex flex-col gap-2 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-xs text-muted">{ilTime(e.created_at)}</span><span>{(ORDER_STATUS[e.to_status] ?? { label: e.to_status }).label}<span className="text-muted"> · {e.actor}{e.note ? ` · ${e.note}` : ""}</span></span></li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>Delivery</SectionTitle>
            <div className="flex flex-col gap-2 text-sm">
              <div className="font-medium" dir="auto">{a.full_name}</div>
              <div className="flex items-center gap-2 text-ink-2"><Phone className="h-4 w-4 text-muted" /><a href={`tel:${a.phone}`} className="tabular-nums hover:underline">{a.phone}</a>{a.phone_alt ? <span className="text-muted"> / {a.phone_alt}</span> : null}</div>
              <div className="flex items-start gap-2 text-ink-2" dir="auto"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{[a.town, a.street, a.house_number, a.landmark].filter(Boolean).join("، ")}</div>
            </div>
          </Card>
          <Card>
            <SectionTitle>Update status</SectionTitle>
            <form action={changeOrderStatus} className="flex flex-col gap-3 text-sm">
              <input type="hidden" name="orderId" value={o.id} />
              <select name="status" defaultValue={o.status} className={input}>
                {next.map((s) => <option key={s} value={s}>{(ORDER_STATUS[s] ?? { label: s }).label}</option>)}
              </select>
              <label className="flex items-start gap-2.5 rounded-xl bg-paper p-3">
                <input type="checkbox" name="notify" className="mt-0.5 h-4 w-4 accent-[var(--pitch)]" />
                <span>Message the customer on Instagram
                  <span className="mt-1 block text-xs text-muted">Only for: {Object.keys(STATUS_MESSAGE).map((k) => msgLabels[k]).join(", ")}. Sent in your style, in Arabic.</span>
                </span>
              </label>
              <input name="note" placeholder="Note (optional)" className={input} />
              <button className={`${button.primary} self-start`}>Save</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
