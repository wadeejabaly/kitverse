import Link from "next/link";
import { PackagePlus, PackageSearch, Search, X } from "lucide-react";
import { db } from "@/lib/db";
import { addInventory, setInventoryQty } from "../../inventory-actions";
import { PageHeader, Card, SectionTitle, Badge, EmptyState, cx, button, input } from "../../ui";
import { DeleteStockButton } from "./delete-stock-button";

export const dynamic = "force-dynamic";

const AUDIENCE_LABEL: Record<string, string> = { adult: "Adult", women: "Women", kids: "Kids" };
const VERSION_LABEL: Record<string, string> = { fan: "Fan", player: "Player" };

type ProductHit = { id: string; title_en: string; team: { name_en: string } | null };
type StockRow = {
  id: string; product_id: string; audience: string; version: string; sleeve: string; size: string; qty: number; note: string | null;
  product: { title_en: string; team: { name_en: string } | null } | null;
};

/** Collapsed "+ Add stock" form for one search result - audience/version/sleeve/size/qty/note straight to addInventory. */
function AddStockRow({ product }: { product: ProductHit }) {
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
        <form action={addInventory} className="mt-2.5 flex flex-wrap items-end gap-2">
          <input type="hidden" name="productId" value={product.id} />
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
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">Note (optional)
            <input name="note" maxLength={200} placeholder="e.g. from supplier order" className={cx(input, "py-1.5")} />
          </label>
          <button className={cx(button.primary, "py-1.5")}>Add</button>
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
 * order), so an order page can tell him whether an item needs ordering from the supplier. See
 * supabase/migrations/20261104090000_inventory.sql for why it's matched by (product_id, audience,
 * version, sleeve, size) only. Search here is server-side (.ilike on search_text) rather than a
 * client-side picker - there are 10,877 products, far too many to ship to the browser.
 */
export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const stock = ((await db().from("inventory_items")
    .select("id,product_id,audience,version,sleeve,size,qty,note,product:products(title_en,team:teams(name_en))")
    .order("updated_at", { ascending: false })).data ?? []) as unknown as StockRow[];

  const results = q
    ? ((await db().from("products").select("id,title_en,team:teams(name_en)").ilike("search_text", `%${q}%`).order("title_en").limit(12)).data ?? []) as unknown as ProductHit[]
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
