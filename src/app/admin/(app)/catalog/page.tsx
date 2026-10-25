import Link from "next/link";
import { ImageOff, ArrowRight, Layers, Shirt, Store, MessagesSquare } from "lucide-react";
import { db } from "@/lib/db";
import catalog from "@/data/catalog.json";
import collections from "@/data/collections.json";
import { PageHeader, Card, Stat, SectionTitle } from "../../ui";

export const dynamic = "force-dynamic";

type WebShirt = { handle: string; team: string; kind: string; league: string | null; image: string };

/**
 * What the website sells: Wadeea's hand-picked list (catalog/store-selection.json), exported into
 * src/data/catalog.json on every deploy. Read-only - the list itself changes in code, not here.
 */
export default async function Catalog() {
  const shirts = (catalog as { products: WebShirt[] }).products;
  const noPhoto = shirts.filter((s) => s.image.includes("_placeholder"));
  const [notAtSupplier, botOnly] = await Promise.all([
    db().from("products").select("id", { count: "exact", head: true }).eq("status", "featured").contains("flags", ["not_at_supplier"]),
    db().from("products").select("id", { count: "exact", head: true }).eq("status", "available"),
  ]);

  const groups = [
    ...collections.leagues.map((l) => ({ id: l.slug, label: l.name, rows: shirts.filter((s) => s.league === l.slug) })),
    { id: "national", label: "National teams", rows: shirts.filter((s) => s.kind === "national") },
  ].filter((g) => g.rows.length);
  const byTeam = (rows: WebShirt[]) => [...new Set(rows.map((r) => r.team))].map((team) => {
    const t = rows.filter((r) => r.team === team);
    return { team, count: t.length, missing: t.filter((r) => r.image.includes("_placeholder")).length };
  }).sort((a, b) => a.team.localeCompare(b.team));

  return (
    <>
      <PageHeader title="Catalog" subtitle="The shirts on the website - Wadeea's hand-picked list. The bot can also sell any other shirt the supplier has." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="On the website" value={shirts.length} icon={Store} />
        <Stat label="Teams" value={new Set(shirts.map((s) => s.team)).size} icon={Layers} />
        <Stat label="Not at the supplier" value={notAtSupplier.count ?? 0} icon={Shirt} />
        <Stat label="Bot-only shirts" value={botOnly.count ?? 0} icon={MessagesSquare} />
      </div>
      <p className="mt-2 text-xs text-muted">&quot;Not at the supplier&quot;: on the website but not in the supplier&apos;s albums - the bot checks with you before confirming them. Bot-only: in the supplier catalog, sold through Instagram on request.</p>

      {noPhoto.length ? (
        <Link href="/admin/photos" className="mt-4 flex items-center gap-3 rounded-xl border border-line border-l-[3px] border-l-amber bg-surface px-4 py-3 text-sm text-ink hover:bg-raised">
          <ImageOff className="h-4 w-4 text-amber" /> {noPhoto.length} website shirts show a blank shirt instead of a photo <ArrowRight className="ml-auto h-4 w-4 text-muted" />
        </Link>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.id} padded={false} className="overflow-hidden">
            <div className="px-4 pt-4 sm:px-5"><SectionTitle>{g.label} · {g.rows.length} shirts</SectionTitle></div>
            <div className="divide-y divide-line border-t border-line">
              {byTeam(g.rows).map((t) => (
                <div key={t.team} className="flex items-center gap-3 px-4 py-2 text-sm sm:px-5">
                  <span className="flex-1 truncate">{t.team}</span>
                  {t.missing ? <span className="text-xs text-amber">{t.missing} without photo</span> : null}
                  <span className="w-6 text-right tabular-nums text-muted">{t.count}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
