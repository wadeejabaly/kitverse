import { Truck, ShieldCheck, BadgeCheck } from "lucide-react";
import { currentPriceList } from "@/lib/pricing/load";
import { previewDeliveryFees, applyDeliveryFees, publishPriceList } from "../../pricing-actions";
import { PageHeader, Card, Badge, SectionTitle, button } from "../../ui";

export const dynamic = "force-dynamic";

/** The price list the bot and the website quote from: shirt prices and add-ons (read-only here),
 *  delivery fees (two-tier owner decision, applied with one click) and the publish switch. */
export default async function Pricing() {
  const [list, preview] = await Promise.all([currentPriceList(), previewDeliveryFees()]);
  const anyChange = preview.zones.some((z) => z.changes);
  const draft = list.status !== "published";
  const row = (label: string, value: string, key: string) => (
    <div key={key} className="flex items-center justify-between px-4 py-2.5 text-sm sm:px-5"><span dir="auto">{label}</span><span className="tabular-nums">{value}</span></div>
  );

  return (
    <>
      <PageHeader title="Pricing" subtitle="What the bot and the website charge. Both always use this same list."
        actions={draft ? <form action={publishPriceList}><button className={button.primary}><BadgeCheck className="h-4 w-4" /> Approve & publish</button></form> : <Badge tone="green">Published</Badge>} />
      {draft ? <p className="mb-4 rounded-xl bg-amber-soft px-3 py-2.5 text-sm text-amber">This price list is still a draft. Check it below, then tap Approve &amp; publish. (The bot already uses it.)</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padded={false} className="overflow-hidden">
          <div className="px-4 pt-4 sm:px-5"><SectionTitle>Shirts</SectionTitle></div>
          <div className="divide-y divide-line border-t border-line">{list.data.groups.map((g) => row(g.name_en, `₪${g.price}`, g.id))}</div>
        </Card>
        <Card padded={false} className="overflow-hidden">
          <div className="px-4 pt-4 sm:px-5"><SectionTitle>Extras</SectionTitle></div>
          <div className="divide-y divide-line border-t border-line">
            {list.data.addons.map((a) => row(a.name_en, `+₪${a.price}`, a.id))}
            {list.data.offers.filter((o) => o.active).map((o) => row(o.name_en, `from ${o.min_qty}: ₪${o.unit_price.short} each`, o.id))}
          </div>
        </Card>
      </div>

      <div className="mt-6"><SectionTitle>Delivery</SectionTitle></div>
      <p className="mb-3 text-sm text-muted">Two tiers: cheaper up north (through Kfar Qara), one fee everywhere else - the West Bank included.</p>
      <Card padded={false} className="mb-4 divide-y divide-line overflow-hidden">
        {preview.zones.map((z) => (
          <div key={z.id} className="flex items-center justify-between px-4 py-3 sm:px-5">
            <div className="text-sm font-medium" dir="auto">{z.label}</div>
            <div className="flex items-center gap-2 text-sm tabular-nums">
              <span className={z.changes ? "text-muted line-through" : ""}>₪{z.currentFee}</span>
              {z.changes ? <span className="font-medium text-pitch">→ ₪{z.newFee}</span> : null}
            </div>
          </div>
        ))}
      </Card>
      {!anyChange ? (
        <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="h-4 w-4" /> Delivery fees match the two-tier scheme.</p>
      ) : (
        <form action={applyDeliveryFees} className="flex flex-wrap items-center gap-3">
          <button className={button.primary}><Truck className="h-4 w-4" /> Apply new delivery fees</button>
          <span className="text-xs text-muted">The bot and the website checkout switch to the new fees right away.</span>
        </form>
      )}
    </>
  );
}
