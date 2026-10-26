import { Pause, Play, Percent } from "lucide-react";
import { db } from "@/lib/db";
import { setDiscountCodeActive } from "../../discounts-actions";
import { PageHeader, Card, Badge, EmptyState, SectionTitle, button, ilTime, type Tone } from "../../ui";
import { DiscountForm, DeleteCodeButton } from "./discount-form";

export const dynamic = "force-dynamic";

type Row = {
  code: string; kind: "percent" | "fixed"; value: number; min_order: number;
  starts_at: string | null; ends_at: string | null; max_uses: number | null; used_count: number; active: boolean; stackable: boolean;
};

function statusOf(r: Row): { label: string; tone: Tone } {
  const now = new Date();
  if (!r.active) return { label: "Paused", tone: "neutral" };
  if (r.starts_at && now < new Date(r.starts_at)) return { label: "Not started", tone: "amber" };
  if (r.ends_at && now > new Date(r.ends_at)) return { label: "Expired", tone: "red" };
  if (r.max_uses != null && r.used_count >= r.max_uses) return { label: "Used up", tone: "red" };
  return { label: "Active", tone: "green" };
}

const ils = (a: number) => `₪${(a / 100).toFixed(2).replace(/\.00$/, "")}`;
const worth = (r: Row) => (r.kind === "percent" ? `${r.value}% off` : `${ils(r.value)} off`);

/** Codes shoppers type at checkout. Applied and tracked automatically in src/lib/orders/web.ts - no approval needed, the code is its own authority (see adjustments.kind = 'discount_code'). */
export default async function Discounts({ searchParams }: PageProps<"/admin/discounts">) {
  const sp = await searchParams;
  const saved = sp.saved === "1";
  const error = typeof sp.error === "string" ? sp.error : null;
  const rows = ((await db().from("discount_codes").select("code,kind,value,min_order,starts_at,ends_at,max_uses,used_count,active,stackable")
    .order("created_at", { ascending: false })).data ?? []) as Row[];

  return (
    <>
      <PageHeader title="Discounts" subtitle='Codes shoppers type at checkout for a percent or a flat amount off. By default a code works alone - check "Can be combined with other codes" to let it stack with other combinable codes.' />

      {error ? <p className="mb-4 rounded-xl bg-red-soft px-3 py-2.5 text-sm text-red">{error}</p> : null}
      {saved ? <p className="mb-4 rounded-xl bg-pitch-soft/60 px-3 py-2.5 text-sm text-ink">Code saved - it works at checkout right away.</p> : null}

      <Card className="mb-6">
        <SectionTitle>New code</SectionTitle>
        <DiscountForm />
      </Card>

      {!rows.length ? (
        <EmptyState icon={Percent} title="No discount codes yet" text="Create one above - shoppers will be able to type it at checkout." />
      ) : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const status = statusOf(r);
            return (
              <div key={r.code} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="font-mono text-sm font-medium tracking-wide">{r.code}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {r.stackable ? <Badge>Combinable</Badge> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <span>{worth(r)}</span>
                    {r.min_order > 0 ? <span>· min {ils(r.min_order)}</span> : null}
                    <span>· {r.used_count}{r.max_uses ? `/${r.max_uses}` : ""} used</span>
                    {r.starts_at ? <span>· from {ilTime(r.starts_at)}</span> : null}
                    {r.ends_at ? <span>· until {ilTime(r.ends_at)}</span> : null}
                  </div>
                </div>
                <form action={setDiscountCodeActive}>
                  <input type="hidden" name="code" value={r.code} />
                  <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                  <button className={button.ghost} aria-label={r.active ? "Pause" : "Resume"}>
                    {r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </form>
                <DeleteCodeButton code={r.code} />
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
