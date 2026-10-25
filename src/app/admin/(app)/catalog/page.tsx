import { ShieldCheck, Layers } from "lucide-react";
import { CATALOG_SCOPE, previewCatalogScope, applyCatalogScope } from "../../catalog-actions";
import { PageHeader, Card, Badge, button } from "../../ui";

export const dynamic = "force-dynamic";

const LEAGUE_LABEL: Record<string, string> = {
  "premier-league": "Premier League", "la-liga": "La Liga", "serie-a": "Serie A",
  "bundesliga": "Bundesliga", "ligue-1": "Ligue 1",
};
const CLUB_LABEL: Record<string, string> = { "al-nassr": "Al-Nassr", "alahli-saudi": "Alahli Saudi" };

/** One-time (repeatable) scope change: website shows only the agreed leagues/clubs + national teams,
 *  current season only. Everything else already in the catalog moves to "available" (bot-only), not deleted. */
export default async function CatalogScope() {
  const preview = await previewCatalogScope();
  const noChange = preview.toFeature === 0 && preview.toUnfeature === 0;

  return (
    <>
      <PageHeader title="Catalog scope" subtitle="What shows on the website. Nothing is deleted - removed shirts stay sellable through the bot." />

      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-2"><Layers className="h-4 w-4" /> Agreed scope</div>
        <div className="flex flex-wrap gap-1.5">
          {CATALOG_SCOPE.leagueIds.map((l) => <Badge key={l}>{LEAGUE_LABEL[l] ?? l}</Badge>)}
          {CATALOG_SCOPE.extraClubIds.map((c) => <Badge key={c} tone="green">{CLUB_LABEL[c] ?? c}</Badge>)}
          <Badge tone="green">All national teams</Badge>
        </div>
        <p className="mt-3 text-sm text-muted">
          Current season only: clubs season {CATALOG_SCOPE.clubSeason}; national teams {CATALOG_SCOPE.nationalSeasons.join(" or ")}. No retro, no older seasons.
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
