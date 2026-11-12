import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import catalog from "@/data/catalog.json";
import { OUT_OF_STOCK_FLAG, SITE_LISTED_FLAG } from "@/lib/catalog/stock";
import { PageHeader, button } from "../../../ui";
import { StockList, type StockRow } from "./stock-list";

export const dynamic = "force-dynamic";

/** In stock / out of stock for every website shirt (owner request 2026-11-12) - see src/lib/catalog/stock.ts. */
export default async function StockPage() {
  const handles = (catalog as { products: { handle: string }[] }).products.map((p) => p.handle);
  const select = "id,handle,title_en,season,flags,primary_image_url,status";
  type Row = { id: string; handle: string; title_en: string; season: string | null; flags: string[] | null; primary_image_url: string | null; status: string };
  const rows: Row[] = [];
  for (let i = 0; i < handles.length; i += 200) {
    rows.push(...(((await db().from("products").select(select).in("handle", handles.slice(i, i + 200))).data ?? []) as Row[]));
  }
  // shirts added in admin that this deploy's catalog.json doesn't list yet
  const seen = new Set(rows.map((r) => r.id));
  rows.push(...(((await db().from("products").select(select).contains("flags", [SITE_LISTED_FLAG])).data ?? []) as Row[]).filter((r) => !seen.has(r.id)));
  const list: StockRow[] = rows
    .filter((r) => r.status !== "hidden")
    .map((r) => ({ id: r.id, handle: r.handle, title: r.title_en, image: r.primary_image_url, inStock: !(r.flags ?? []).includes(OUT_OF_STOCK_FLAG) }))
    .sort((a, b) => Number(a.inStock) - Number(b.inStock) || a.title.localeCompare(b.title));
  const out = list.filter((r) => !r.inStock).length;
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Stock"
        subtitle={`${list.length} website shirts · ${out} out of stock. An out-of-stock shirt stays on the website greyed out with no buy button, and the bot won't take orders for it. Changes show on the website in about 2 minutes.`}
        actions={<Link href="/admin/catalog" className={button.ghost}><ArrowLeft className="h-4 w-4" /> Products</Link>}
      />
      <StockList rows={list} />
    </>
  );
}
