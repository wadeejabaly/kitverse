import { ShieldCheck, BadgeCheck, ArrowRight } from "lucide-react";
import { currentPriceList } from "@/lib/pricing/load";
import { previewPriceChanges, applyPriceChanges, publishPriceList } from "../../pricing-actions";
import { PageHeader, Card, Badge, SectionTitle, button } from "../../ui";

export const dynamic = "force-dynamic";

/** The live price list the bot and the website checkout quote from, approved price changes waiting
 *  to go live (from pricing/price-list.draft.json, applied with one tap) and the publish switch. */
export default async function Pricing() {
  const [list, preview] = await Promise.all([currentPriceList(), previewPriceChanges()]);
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
      <Card padded={false} className="mb-6 divide-y divide-line overflow-hidden">
        {list.data.delivery.zones.map((z) => row(`${z.name_ar} · ${z.days} days`, `₪${z.fee}`, z.id))}
      </Card>

      {preview.changes.length ? (
        <Card accent="amber">
          <SectionTitle>Approved price changes - not live yet</SectionTitle>
          <div className="mb-4 flex flex-col divide-y divide-line text-sm">
            {preview.changes.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1" dir="auto">{c.what}</span>
                <span className="tabular-nums text-muted line-through" dir="auto">{c.from}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted" />
                <span className="font-medium tabular-nums text-pitch" dir="auto">{c.to}</span>
              </div>
            ))}
          </div>
          <form action={applyPriceChanges} className="flex flex-wrap items-center gap-3">
            <button className={button.primary}>Apply {preview.changes.length} change{preview.changes.length > 1 ? "s" : ""}</button>
            <span className="text-xs text-muted">The bot and the website checkout use the new prices right away.</span>
          </form>
        </Card>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="h-4 w-4" /> Live prices match the approved price list.</p>
      )}
    </>
  );
}
