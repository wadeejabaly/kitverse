import { BadgeCheck, Save } from "lucide-react";
import { currentPriceList } from "@/lib/pricing/load";
import { env } from "@/lib/env";
import { savePrices, publishPriceList } from "../../pricing-actions";
import { PageHeader, Card, Badge, SectionTitle, button, input, cx } from "../../ui";

export const dynamic = "force-dynamic";

/** Every price the bot and the website charge, edited here. One Save for the whole list. */
export default async function Pricing({ searchParams }: PageProps<"/admin/pricing">) {
  const sp = await searchParams;
  const list = await currentPriceList();
  const p = list.data;
  const draft = list.status !== "published";
  const saved = typeof sp.saved === "string" ? Number(sp.saved) : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const hook = !!env().VERCEL_DEPLOY_HOOK_URL;

  const money = (name: string, value: number | undefined, prefix = "₪") => (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted">{prefix}
      <input name={name} defaultValue={value ?? ""} inputMode="decimal" className={cx(input, "w-24 text-right tabular-nums")} aria-label={name} />
    </label>
  );
  const row = (label: React.ReactNode, control: React.ReactNode, key: string) => (
    <div key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5"><span dir="auto">{label}</span>{control}</div>
  );

  return (
    <>
      <PageHeader title="Pricing" subtitle="Every price the bot and the website charge. Change a number and tap Save."
        actions={<>
          {draft ? <form action={publishPriceList}><button className={button.ghost}><BadgeCheck className="h-4 w-4" /> Approve &amp; publish</button></form> : <Badge tone="green">Published</Badge>}
          <button form="prices" className={button.primary}><Save className="h-4 w-4" /> Save prices</button>
        </>} />

      {error ? <p className="mb-4 rounded-xl bg-red-soft px-3 py-2.5 text-sm text-red">{error}</p> : null}
      {saved !== null && !error ? (
        <p className="mb-4 rounded-xl bg-pitch-soft/60 px-3 py-2.5 text-sm text-ink">
          {saved ? `Saved ${saved} change${saved > 1 ? "s" : ""}. The bot and the website checkout use the new prices now; the prices shown on the website update ${hook ? "in about 2 minutes" : "after the next site update"}.` : "Nothing changed."}
        </p>
      ) : null}
      {draft ? <p className="mb-4 rounded-xl bg-amber-soft px-3 py-2.5 text-sm text-amber">This price list is still a draft. Check it, then tap Approve &amp; publish. (The bot already uses it.)</p> : null}

      <form id="prices" action={savePrices} className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card padded={false} className="overflow-hidden">
            <div className="px-4 pt-4 sm:px-5"><SectionTitle>Shirts</SectionTitle></div>
            <div className="divide-y divide-line border-t border-line">{p.groups.map((g) => row(g.name_en, money(`g:${g.id}`, g.price), g.id))}</div>
          </Card>
          <Card padded={false} className="overflow-hidden">
            <div className="px-4 pt-4 sm:px-5"><SectionTitle>Extras</SectionTitle></div>
            <div className="divide-y divide-line border-t border-line">
              {p.addons.map((a) => a.per === "patch"
                ? row(<span>{a.name_en}<span className="block text-xs text-muted">1st / 2nd / 3rd patch on the same shirt</span></span>,
                  <div className="flex flex-wrap items-center gap-2">{[1, 2, 3].map((n) => <span key={n}>{money(`a:${a.id}:${n}`, a.price_tiers?.[n - 1] ?? a.price, n === 1 ? "+₪" : "")}</span>)}</div>, a.id)
                : row(a.name_en, money(`a:${a.id}`, a.price, "+₪"), a.id))}
            </div>
          </Card>
        </div>

        {p.offers.length ? (
          <Card padded={false} className="overflow-hidden">
            <div className="px-4 pt-4 sm:px-5"><SectionTitle>Offers</SectionTitle></div>
            <div className="divide-y divide-line border-t border-line">
              {p.offers.map((o) => row(
                <label className="flex items-center gap-2.5"><input type="checkbox" name={`o:${o.id}:active`} defaultChecked={o.active} className="h-4 w-4 accent-[var(--pitch)]" />{o.name_en}</label>,
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-muted">from
                    <input name={`o:${o.id}:min`} defaultValue={o.min_qty} inputMode="numeric" className={cx(input, "w-16 text-right tabular-nums")} aria-label="minimum shirts" /> shirts,</label>
                  {money(`o:${o.id}:short`, o.unit_price.short)}
                  {o.unit_price.long !== undefined ? <span className="flex items-center gap-1.5 text-sm text-muted">long sleeve {money(`o:${o.id}:long`, o.unit_price.long)}</span> : null}
                  <span className="text-sm text-muted">each</span>
                </div>, o.id))}
            </div>
          </Card>
        ) : null}

        <Card padded={false} className="overflow-hidden">
          <div className="px-4 pt-4 sm:px-5"><SectionTitle>Delivery</SectionTitle></div>
          <div className="divide-y divide-line border-t border-line">
            {p.delivery.zones.map((z) => (
              <div key={z.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                <input name={`z:${z.id}:name`} defaultValue={z.name_ar} dir="auto" className={cx(input, "min-w-40 flex-1")} aria-label="area name" />
                <label className="flex items-center gap-1.5 text-muted">days <input name={`z:${z.id}:days`} defaultValue={z.days} className={cx(input, "w-28")} aria-label="delivery days" /></label>
                {money(`z:${z.id}:fee`, z.fee)}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <button className={button.primary}><Save className="h-4 w-4" /> Save prices</button>
          <span className="text-xs text-muted">The bot and the website checkout switch to the new prices the moment you save. Totals are always calculated from these numbers, never typed by the bot.</span>
        </div>
      </form>
    </>
  );
}
