/* eslint-disable @next/next/no-img-element */
import { Images, Check, X, Plus, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { setLinkStatus, addLink } from "../../media-actions";
import { PageHeader, Card, Badge, EmptyState, input } from "../../ui";

export const dynamic = "force-dynamic";

/** Posts / stories / ads and the shirts they show. Confirmed links let the bot know what a reply refers to. */
export default async function Media() {
  const { data } = await db().from("ig_media")
    .select("id,kind,permalink,caption,image_url,posted_at,links:ig_media_products(id,status,confidence,product:products(title_ar,title_en,primary_image_url))")
    .neq("kind", "carousel_item").order("posted_at", { ascending: false, nullsFirst: false }).limit(40);
  const rows = (data ?? []) as unknown as { id: string; kind: string; permalink: string | null; caption: string | null; image_url: string | null;
    links: { id: string; status: string; confidence: number | null; product: { title_ar: string | null; title_en: string; primary_image_url: string | null } }[] }[];
  return (
    <>
      <PageHeader title="Posts & shirts" subtitle="New posts and stories are matched to shirts automatically. Confirm the matches so the bot knows what a reply refers to." />
      {!rows.length ? <EmptyState icon={Images} title="Nothing synced yet" text="Posts and stories appear here every 15 minutes once Instagram is connected." /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((m) => (
            <Card key={m.id} padded={false} className="flex overflow-hidden">
              <div className="relative w-28 shrink-0 bg-paper">
                {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-cover" /> : null}
                <Badge tone="ink" className="absolute left-2 top-2 capitalize">{m.kind}</Badge>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                {m.caption ? <p className="line-clamp-2 text-xs text-muted" dir="auto">{m.caption}</p> : null}
                {m.links.filter((l) => l.status !== "rejected").map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    {l.product.primary_image_url ? <img src={l.product.primary_image_url} alt="" className="h-9 w-9 rounded-lg border border-line object-cover" /> : <div className="h-9 w-9 rounded-lg bg-paper" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{l.product.title_en}</div>
                      {l.status === "suggested" ? <div className="text-[11px] text-amber">Suggested{l.confidence ? ` · ${Math.round(l.confidence * 100)}%` : ""}</div> : <div className="text-[11px] text-pitch">Confirmed</div>}
                    </div>
                    {l.status === "suggested" ? (
                      <div className="flex gap-1">
                        <form action={setLinkStatus}><input type="hidden" name="linkId" value={l.id} /><button name="status" value="confirmed" aria-label="Confirm" className="grid h-8 w-8 place-items-center rounded-lg bg-pitch-fill text-white"><Check className="h-4 w-4" /></button></form>
                        <form action={setLinkStatus}><input type="hidden" name="linkId" value={l.id} /><button name="status" value="rejected" aria-label="Reject" className="grid h-8 w-8 place-items-center rounded-lg border border-line-2 text-muted hover:text-red"><X className="h-4 w-4" /></button></form>
                      </div>
                    ) : null}
                  </div>
                ))}
                <form action={addLink} className="mt-auto flex gap-1.5">
                  <input type="hidden" name="mediaId" value={m.id} />
                  <input name="q" placeholder="Add: Barcelona 2026/27 Away" className={`${input} py-1.5 text-xs`} />
                  <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-2 text-ink-2 hover:bg-raised" aria-label="Add shirt"><Plus className="h-4 w-4" /></button>
                </form>
                {m.permalink ? <a href={m.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"><ExternalLink className="h-3 w-3" /> View on Instagram</a> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
