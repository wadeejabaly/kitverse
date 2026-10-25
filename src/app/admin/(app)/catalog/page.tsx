import { ShieldCheck, Layers } from "lucide-react";
import { previewCatalogScope, applyCatalogScope } from "../../catalog-actions";
import { CLUBS_BY_LEAGUE, EXTRA_CLUBS, NATIONAL_IDS, CATALOG_SCOPE } from "../../catalog-scope";
import { PageHeader, Card, Badge, button } from "../../ui";

export const dynamic = "force-dynamic";

/** One-time (repeatable) scope change: website shows only this hand-picked list of clubs and
 *  national teams (not "every club in these leagues"), current season only. Everything else
 *  already in the catalog moves to "available" (bot-only), not deleted. */
export default async function CatalogScope() {
  const preview = await previewCatalogScope();
  const noChange = preview.toFeature === 0 && preview.toUnfeature === 0;

  return (
    <>
      <PageHeader title="Catalog scope" subtitle="What shows on the website. Nothing is deleted - removed shirts stay sellable through the bot." />

      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-2"><Layers className="h-4 w-4" /> Curated scope - {CATALOG_SCOPE.clubIds.length} clubs, {NATIONAL_IDS.length} national teams</div>
        {Object.entries(CLUBS_BY_LEAGUE).map(([key, league]) => (
          <div key={key} className="mb-2.5">
            <div className="mb-1 text-xs font-medium text-muted">{league.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {league.ids.map((id) => <Badge key={id}>{id}</Badge>)}
            </div>
          </div>
        ))}
        <div className="mb-2.5">
          <div className="mb-1 text-xs font-medium text-muted">{EXTRA_CLUBS.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {EXTRA_CLUBS.ids.map((id) => <Badge key={id} tone="green">{id}</Badge>)}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted">National teams ({NATIONAL_IDS.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {NATIONAL_IDS.map((id) => <Badge key={id} tone="green">{id}</Badge>)}
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Current season only: clubs season {CATALOG_SCOPE.clubSeason}; national teams {CATALOG_SCOPE.nationalSeasons.join(" or ")}. No retro, no older seasons.
          Team ids with no matching product below (e.g. a club this supplier doesn&apos;t currently stock) simply add nothing - safe to apply either way.
        </p>
      </Card>

      <Card padded={false} className="mb-4 divide-y divide-line overflow-hidden">
        <Row label="Matches this scope" value={preview.matchingTotal} />
        <Row label="Currently on the website" value={preview.currentlyFeaturedTotal} />
        <Row label="Already correct" value={preview.staysFeatured} />
        <Row label="Will be added to the website" value={preview.toFeature} tone={preview.toFeature ? "green" : undefined} />
        <Row label="Will be removed from the website (bot-only after)" value={preview.toUnfeature} tone={preview.toUnfeature ? "amber" : undefined} />
      </Card>

      {noChange ? (
        <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="h-4 w-4" /> The website already matches this scope exactly.</p>
      ) : (
        <form action={applyCatalogScope}>
          <button className={button.primary}>Apply - update {preview.toFeature + preview.toUnfeature} products</button>
        </form>
      )}
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 sm:px-5">
      <span className="text-sm text-ink-2">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${tone === "green" ? "text-pitch" : tone === "amber" ? "text-amber" : ""}`}>{value}</span>
    </div>
  );
}
