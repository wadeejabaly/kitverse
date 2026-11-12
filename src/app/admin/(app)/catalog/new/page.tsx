import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import collections from "../../../../../../catalog/store-collections.json";
import { PageHeader, button } from "../../../ui";
import { AddShirtForm, type TeamChoice } from "./add-shirt-form";

export const dynamic = "force-dynamic";

/** Admin "Add shirt" (owner request 2026-11-12) - the form is ./add-shirt-form.tsx, the save is ../../../catalog-actions.ts. */
export default async function AddShirtPage() {
  const teams = (collections as { teams: { slug: string; name: string; nameAr: string; nameHe?: string }[] }).teams;
  const leagues = (collections as { leagues: { slug: string; name: string }[] }).leagues;
  const rows = ((await db().from("teams").select("id,type,league_id").in("id", teams.map((t) => t.slug))).data ?? []) as { id: string; type: "club" | "national"; league_id: string | null }[];
  const dbTeams = new Map(rows.map((r) => [r.id, r]));
  const choices: TeamChoice[] = teams
    .filter((t) => dbTeams.has(t.slug))
    .map((t) => {
      const d = dbTeams.get(t.slug)!;
      return { slug: t.slug, name: t.name, nameAr: t.nameAr, nameHe: t.nameHe ?? t.name, type: d.type, league: d.league_id };
    });
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Add a shirt"
        subtitle="Pick the team, season and kit - the name is written for you in English, Arabic and Hebrew, always in the same format. It goes on the website about 2 minutes after you save."
        actions={<Link href="/admin/catalog" className={button.ghost}><ArrowLeft className="h-4 w-4" /> Products</Link>}
      />
      <AddShirtForm teams={choices} leagues={leagues.map((l) => ({ slug: l.slug, name: l.name }))} />
    </>
  );
}
