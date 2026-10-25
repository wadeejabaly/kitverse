import { Truck, ShieldCheck } from "lucide-react";
import { previewDeliveryFees, applyDeliveryFees } from "../../pricing-actions";
import { PageHeader, Card, Badge, button } from "../../ui";

export const dynamic = "force-dynamic";

/** Delivery fees only - the shirt prices, add-ons and offers live in the price list the bot already
 *  quotes from and are not touched here. */
export default async function Pricing() {
  const preview = await previewDeliveryFees();
  const anyChange = preview.zones.some((z) => z.changes);

  return (
    <>
      <PageHeader title="Delivery fees" subtitle="Two tiers: cheaper up north (through Kfar Qara), one higher fee everywhere else - the West Bank included." />

      <Card padded={false} className="mb-4 divide-y divide-line overflow-hidden">
        {preview.zones.map((z) => (
          <div key={z.id} className="flex items-center justify-between px-4 py-3 sm:px-5">
            <div>
              <div className="text-sm font-medium" dir="auto">{z.label}</div>
              <div className="text-xs text-muted">zone: {z.id}</div>
            </div>
            <div className="flex items-center gap-2 text-sm tabular-nums">
              <span className={z.changes ? "text-muted line-through" : ""}>₪{z.currentFee}</span>
              {z.changes ? <span className="font-medium text-pitch">→ ₪{z.newFee}</span> : null}
            </div>
          </div>
        ))}
      </Card>

      <p className="mb-4 flex items-center gap-2 text-xs text-muted">
        <Badge>{preview.status === "published" ? "Live price list" : "Draft price list"}</Badge> version {preview.version}
      </p>

      {!anyChange ? (
        <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="h-4 w-4" /> Delivery fees already match the agreed two-tier scheme.</p>
      ) : (
        <form action={applyDeliveryFees}>
          <button className={button.primary}><Truck className="h-4 w-4" /> Apply new delivery fees</button>
        </form>
      )}
    </>
  );
}
