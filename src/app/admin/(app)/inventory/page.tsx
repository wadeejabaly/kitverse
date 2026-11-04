import Link from "next/link";
import { PackagePlus, PackageSearch, Search, X } from "lucide-react";
import { db } from "@/lib/db";
import { PATCHES, type PatchId } from "@/lib/orders/rules";
import { addInventory, setInventoryQty } from "../../inventory-actions";
import { PageHeader, Card, SectionTitle, Badge, EmptyState, cx, button, input } from "../../ui";
import { DeleteStockButton } from "./delete-stock-button";

export const dynamic = "force-dynamic";

const AUDIENCE_LABEL: Record<string, string> = { adult: "Adult", women: "Women", kids: "Kids" };
const VERSION_LABEL: Record<string, string> = { fan: "Fan", player: "Player" };

type Team = { type: "club" | "national"; league_id: string | null };
type ProductHit = { id: string; title_en: string; team: ({ name_en: string } & Team) | null };
type StockRow = {
  id: string; product_id: string; audience: string; version: string; sleeve: string; size: string; qty: number; note: string | null;
  print_name: string; print_number: string; patches: string[];
  product: { title_en: string; team: { name_en: string } | null } | null;
};

/** Same eligibility rules as checkPatches() in lib/orders/rules.ts, just listing options rather than validating a submitted set. */
function patchIdsFor(team: Team | null): PatchId[] {
  if (!team) return [];
  return (Object.keys(PATCHES) as PatchId[]).filter((p) => {
    const rule = PATCHES[p];
    if (team.type === "club" && !rule.clubs) return false;
    if (team.type === "national" && !rule.nations) return false;
    if (p === "league" && !team.league_id) return false;
    if ("leagues" in rule && rule.leagues && (!team.league_id || !(rule.leagues as readonly string[]).includes(team.league_id))) return false;
    return true;
  });
}

/** Collapsed "+ Add stock" form for one search result - audience/version/sleeve/size/qty, plus the
 * exact print name/number/badges on that physical shirt, straight to addInventory. */
function AddStockRow({ product }: { product: ProductHit }) {
  const patchIds = patchIdsFor(product.team);
  const max = product.team?.type === "national" ? 3 : 2;
  return (
    <div className="rounded-lg border border-line-2 px-3 py-2.5">
      <details>
        <summary className="flex cursor-pointer items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm">
            <span className="font-medium">{product.title_en}</span>
            {product.team ? <span className="text-muted"> · {product.team.name_en}</span> : null}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-pitch"><PackagePlus className="h-3.5 w-3.5" /> Add stock</span>
        </summary>
        <form action={addInventory} className="mt-2.5 flex flex-col gap-2.5">
          <input type="hidden" name="productId" value={product.id} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">Audience
              <select name="audience" defaultValue="adult" className={cx(input, "w-28 py-1.5")}>
                <option value="adult">Adult</option><option value="women">Women</option><option value="kids">Kids</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Version
              <select name="version" defaultValue="fan" className={cx(input, "w-24 py-1.5")}>
                <option value="fan">Fan</option><option value="player">Player</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Sleeve
              <select name="sleeve" defaultValue="short" className={cx(input, "w-24 py-1.5")}>
                <option value="short">Short</option><option value="long">Long</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Size
              <input name="size" required placeholder="L" className={cx(input, "w-16 py-1.5")} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Qty
              <input name="qty" type="number" min={1} max={999} defaultValue={1} required className={cx(input, "w-16 py-1.5")} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">Print name (if any)
              <input name="printName" maxLength={14} placeholder="e.g. Messi" className={cx(input, "w-32 py-1.5")} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Print number
              <input name="printNumber" maxLength={2} placeholder="10" className={cx(input, "w-16 py-1.5")} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">Note (optional)
              <input name="note" maxLength={200} placeholder="e.g. from supplier order" className={cx(input, "py-1.5")} />
            </label>
          </div>
          {patchIds.length ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Badges on it (up to {max})</span>
              <div className="flex flex-wrap gap-2">
                {patchIds.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 rounded-lg border border-line-2 px-2 py-1 text-xs">
                    <input type="checkbox" name="patches" value={p} className="h-3.5 w-3.5 accent-[var(--pitch)]" dir="rtl" /> {PATCHES[p].label_ar}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <button className={cx(button.primary, "self-start py-1.5")}>Add</button>
        </form>
      </details>
    </div>
  );
}

/** One on-hand row: qty correction inline, remove on the right. */
function StockRow({ row }: { row: StockRow }) {
  const label = row.product?.title_en ?? "Unknown shirt";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}{row.product?.team ? <span className="font-normal text-muted"> · {row.product.team.name_en}</span> : null}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge>{AUDIENCE_LABEL[row.audience] ?? row.audience}</Badge>
          <Badge>{VERSION_LABEL[row.version] ?? row.version}</Badge>
          <Badge>{row.sleeve === "long" ? "Long sleeve" : "Short sleeve"}</Badge>
          <Badge tone="ink">{row.size}</Badge>
          {row.print_name || row.print_number ? <Badge tone="green">{[row.print_name, row.print_number].filter(Boolean).join(" ")}</Badge> : <Badge>blank</Badge>}
          {row.patches.length ? <Badge>{row.patches.map((p) => PATCHES[p as PatchId]?.label_ar ?? p).join(" + ")}</Badge> : null}
          {row.note ? <span className="self-center text-xs text-muted">{row.note}</span> : null}
        </div>
      </div>
      <form action={setInventoryQty} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={row.id} />
        <input name="qty" type="number" min={0} max={999} defaultValue={row.qty} className={cx(input, "w-16 py-1.5 text-center")} />
        <button className={cx(button.ghost, "px-2.5 py-1.5 text-xs")}>Save</button>
      </form>
      <DeleteStockButton id={row.id} label={label} />
    </div>
  );
}

/**
 * Owner request 2026-11-04: on-hand stock he logs himself (mostly shirts freed up by a cancelled
 * order), so an order page can tell him whether an item needs ordering from the supplier - and, per
 * his same-day follow-up, exactly what's printed/attached on each one, not just a bare count. See
 * supabase/migrations/20261104090000_inventory.sql and 20261104100000_inventory_print_detail.sql for
 * why MATCHING against order_items still ignores print_name/print_number/patches (a blank shirt in
 * stock can satisfy any order of the right size) even though each row now records them. Search here
 * is server-side (.ilike on search_text) rather than a client-side picker - there are 10,877 products,
 * far too many to ship to the browser.
 */
export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const stock = ((await db().from("inventory_items")
    .select("id,product_id,audience,version,sleeve,size,qty,note,print_name,print_number,patches,product:products(title_en,team:teams(name_en))")
    .order("updated_at", { ascending: false })).data ?? []) as unknown as StockRow[];

  const results = q
    ? ((await db().from("products").select("id,title_en,team:teams(name_en,type,league_id)").ilike("search_text", `%${q}%`).order("title_en").limit(12)).data ?? []) as unknown as ProductHit[]
    : [];

  return (
    <>
      <PageHeader title="Inventory" subtitle="On-hand stock you've logged yourself - mostly shirts freed up by a cancelled order. Order pages check this to tell you if an item is in stock or needs ordering from the supplier." />

      <Card className="mb-5">
        <SectionTitle>Add stock</SectionTitle>
        <form className="mb-3 flex items-center gap-2" action="/admin/inventory">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input type="search" name="q" defaultValue={q} placeholder="Search for a shirt by name" className={cx(input, "pl-8")} />
          </div>
          <button className={button.ghost}>Search</button>
          {q ? <Link href="/admin/inventory" aria-label="Clear search" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink"><X className="h-4 w-4" /></Link> : null}
        </form>
        {q ? (
          results.length ? (
            <div className="flex flex-col gap-2">
              {results.map((p) => <AddStockRow key={p.id} product={p} />)}
            </div>
          ) : <EmptyState icon={Search} title="No shirts match" text="Try a different name." />
        ) : <p className="text-sm text-muted">Search for a shirt above to log stock for it.</p>}
      </Card>

      <Card padded={false}>
        <div className="px-4 pb-0 pt-4 sm:px-5 sm:pt-5"><SectionTitle>On hand ({stock.length})</SectionTitle></div>
        {!stock.length ? (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5"><EmptyState icon={PackageSearch} title="No stock logged yet" text="Add stock above, or accept items back from a cancelled order on that order's page." /></div>
        ) : (
          <div className="divide-y divide-line">
            {stock.map((row) => <StockRow key={row.id} row={row} />)}
          </div>
        )}
      </Card>
    </>
  );
}
