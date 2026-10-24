/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ImageOff, Upload, RotateCcw, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { uploadProductPhoto, retryProductPhoto } from "../../photos-actions";
import { PageHeader, Card, Badge, EmptyState, cx } from "../../ui";

export const dynamic = "force-dynamic";

/** Shirts the bot can't show because every supplier photo failed the quality check. */
export default async function Photos({ searchParams }: PageProps<"/admin/photos">) {
  const sp = await searchParams;
  const tab = sp.tab === "rejected" ? "rejected" : "missing";
  const missing = (await db().from("products").select("id,title_en,status,supplier_primary_album").eq("photo_status", "none_clean")
    .order("status").order("title_en").limit(200)).data ?? [];
  const rejected = tab === "rejected" ? ((await db().from("product_images").select("id,url,quality,product:products(title_en)").eq("status", "bad")
    .order("checked_at", { ascending: false }).limit(48)).data ?? []) as unknown as { id: string; url: string; quality: Record<string, unknown> | null; product: { title_en: string } }[] : [];
  const reason = (q: Record<string, unknown> | null) => !q ? "unreadable" : q.baby_bodysuit ? "baby item" : q.kids_item ? "kids item" : q.overlay_text ? "text on photo" : q.watermark ? "watermark" : q.front_view === false ? "not the front" : q.blurry_or_dark ? "blurry/dark" : "not attractive";

  return (
    <>
      <PageHeader title="Photos" subtitle="Every photo is checked before a customer sees it - no labels, watermarks, kids or baby items, or ugly shots." />
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1 text-sm">
        <Link href="/admin/photos" className={cx("rounded-lg px-3 py-1.5", tab === "missing" ? "bg-ink text-paper" : "text-ink-2")}>Needs a photo ({missing.length})</Link>
        <Link href="/admin/photos?tab=rejected" className={cx("rounded-lg px-3 py-1.5", tab === "rejected" ? "bg-ink text-paper" : "text-ink-2")}>Rejected photos</Link>
      </div>

      {tab === "missing" ? (!missing.length ? <EmptyState icon={ShieldCheck} title="Every checked shirt has a clean photo" /> : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {missing.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-paper text-muted"><ImageOff className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-auto">
                <div className="text-sm font-medium">{p.title_en}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  {p.status === "featured" ? <Badge tone="green">On website</Badge> : <Badge>Bot only</Badge>}
                  {p.supplier_primary_album ? <a href={`https://jerseyxie.x.yupoo.com/albums/${p.supplier_primary_album}?uid=1`} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">supplier album</a> : null}
                </div>
              </div>
              <form action={uploadProductPhoto} className="ml-[3.25rem] flex items-center gap-2 sm:ml-0">
                <input type="hidden" name="productId" value={p.id} />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm hover:bg-raised">
                  <Upload className="h-4 w-4" /> Choose
                  <input type="file" name="photo" accept="image/*" required className="sr-only" />
                </label>
                <button className="rounded-lg bg-pitch-fill px-3 py-2 text-sm font-medium text-white hover:bg-pitch-fill-2">Upload</button>
              </form>
              <form action={retryProductPhoto}><input type="hidden" name="productId" value={p.id} /><button className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-raised hover:text-ink" aria-label="Check supplier photos again"><RotateCcw className="h-4 w-4" /></button></form>
            </div>
          ))}
        </Card>
      )) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {rejected.map((r) => (
            <Card key={r.id} padded={false} className="overflow-hidden">
              <img src={r.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              <div className="p-2.5">
                <div className="truncate text-xs font-medium">{r.product.title_en}</div>
                <Badge tone="red" className="mt-1">{reason(r.quality)}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
