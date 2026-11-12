"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { isRetroSeason } from "@/data/pricing";
import { SHIRT_KITS, seasonChoices, shirtNames, type ShirtKit } from "@/lib/catalog/shirt-names";
import { addShirt, type AddShirtResult } from "../../../catalog-actions";
import { Card, SectionTitle, button, cx, input } from "../../../ui";

export interface TeamChoice {
  slug: string;
  name: string;
  nameAr: string;
  nameHe: string;
  type: "club" | "national";
  league: string | null;
}

const KIT_LABEL: Record<ShirtKit, string> = { Home: "Home", Away: "Away", Third: "Third" };

/**
 * The "Add shirt" form (owner request 2026-11-12). Everything is a choice, not free text, so every name
 * comes out in the one format (src/lib/catalog/shirt-names.ts) - the preview shows exactly what the
 * website will say in all three languages before saving.
 */
export function AddShirtForm({ teams, leagues }: { teams: TeamChoice[]; leagues: { slug: string; name: string }[] }) {
  const [teamSlug, setTeamSlug] = useState("");
  const [season, setSeason] = useState("");
  const [kit, setKit] = useState<ShirtKit>("Home");
  const [player, setPlayer] = useState(true);
  const [longSleeve, setLongSleeve] = useState(false);
  const [shortPhotos, setShortPhotos] = useState<File[]>([]);
  const [longPhotos, setLongPhotos] = useState<File[]>([]);
  const [result, setResult] = useState<AddShirtResult | null>(null);
  const [pending, startTransition] = useTransition();

  const team = teams.find((t) => t.slug === teamSlug) ?? null;
  const seasons = useMemo(() => (team ? seasonChoices(team.type) : []), [team]);

  const retro = season ? isRetroSeason(season) : false;
  const names = team && season ? shirtNames({ team, season, kit, retro }) : null;

  const groups = [
    ...leagues.map((l) => ({ label: l.name, rows: teams.filter((t) => t.league === l.slug) })),
    { label: "Other clubs", rows: teams.filter((t) => t.type === "club" && !leagues.some((l) => l.slug === t.league)) },
    { label: "National teams", rows: teams.filter((t) => t.type === "national") },
  ].filter((g) => g.rows.length);

  function reset() {
    setTeamSlug(""); setSeason(""); setKit("Home"); setPlayer(true); setLongSleeve(false);
    setShortPhotos([]); setLongPhotos([]); setResult(null);
  }

  function submit() {
    if (!team || !season) return;
    const form = new FormData();
    form.set("team", team.slug);
    form.set("season", season);
    form.set("kit", kit);
    if (player && !retro) form.set("player", "on");
    if (longSleeve) form.set("longSleeve", "on");
    for (const f of shortPhotos) form.append("shortPhotos", f);
    if (longSleeve) for (const f of longPhotos) form.append("longPhotos", f);
    startTransition(async () => {
      try {
        setResult(await addShirt(form));
      } catch (e) {
        setResult({ ok: false, error: (e as Error).message || "Something went wrong - try again." });
      }
    });
  }

  if (result?.ok) {
    return (
      <Card accent="green" className="max-w-2xl">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green" />
          <div className="min-w-0">
            <p className="font-bold text-ink">{result.title} {result.reused ? "is now on the website" : "was added"}.</p>
            <p className="mt-1 text-sm text-muted">
              It appears on the website in about 2 minutes.
              {result.reused ? " This shirt was already in the supplier's list, so that listing was used - the bot knows where to order it." : " It isn't in the supplier's list, so the bot will check with you before confirming an order."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={reset} className={button.primary}>Add another shirt</button>
              <a href={`/en/product/${result.handle}`} target="_blank" rel="noreferrer" className={button.ghost}>Open on the website</a>
              <Link href="/admin/photos" className={button.ghost}>Photos</Link>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const ready = !!team && !!season && shortPhotos.length > 0 && (!longSleeve || longPhotos.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Card>
        <div className="grid gap-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-ink">Team</span>
            <select className={input} value={teamSlug} onChange={(e) => {
              // a season that doesn't fit the new team's type (club "2016/17" vs national "2026") is cleared
              const next = teams.find((t) => t.slug === e.target.value);
              if (next && season && !seasonChoices(next.type).includes(season)) setSeason("");
              setTeamSlug(e.target.value);
            }}>
              <option value="">Choose a team…</option>
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.rows.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-bold text-ink">Season</span>
            <select className={input} value={season} onChange={(e) => setSeason(e.target.value)} disabled={!team}>
              <option value="">{team ? "Choose a season…" : "Choose the team first"}</option>
              {seasons.map((s) => <option key={s} value={s}>{s}{isRetroSeason(s) ? " · retro" : ""}</option>)}
            </select>
            <span className="text-xs text-muted">Seasons up to 2023/24 are retro (retro price, fan version only).</span>
          </label>

          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-bold text-ink">Kit</legend>
            <div className="flex flex-wrap gap-2">
              {SHIRT_KITS.map((k) => (
                <button key={k} type="button" onClick={() => setKit(k)} aria-pressed={kit === k}
                  className={cx(kit === k ? button.primary : button.ghost, "min-w-24 justify-center")}>
                  {KIT_LABEL[k]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <span className="text-sm font-bold text-ink">Versions</span>
            <label className={cx("flex items-center gap-2 text-sm", retro && "opacity-50")}>
              <input type="checkbox" checked={player && !retro} disabled={retro} onChange={(e) => setPlayer(e.target.checked)} />
              Player version too (fan version is always included){retro ? " - not for retro" : ""}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={longSleeve} onChange={(e) => setLongSleeve(e.target.checked)} />
              Long sleeve too
            </label>
          </div>

          <PhotoPicker label="Short-sleeve photos" hint="The first photo is the main photo on the website." files={shortPhotos} onChange={setShortPhotos} />
          {longSleeve ? (
            <PhotoPicker label="Long-sleeve photos" hint="Shown when a customer picks long sleeve. The first one is the front." files={longPhotos} onChange={setLongPhotos} />
          ) : null}
        </div>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <SectionTitle>Name on the website</SectionTitle>
          {names ? (
            <dl className="mt-3 grid gap-3 text-sm">
              <div><dt className="text-xs text-muted">English</dt><dd className="font-bold text-ink">{names.en}</dd></div>
              <div><dt className="text-xs text-muted">Arabic</dt><dd className="font-bold text-ink" dir="rtl" lang="ar">{names.ar}</dd></div>
              <div><dt className="text-xs text-muted">Hebrew</dt><dd className="font-bold text-ink" dir="rtl" lang="he">{names.he}</dd></div>
              <div><dt className="text-xs text-muted">Link</dt><dd className="break-all text-muted">/product/{names.handle}</dd></div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">Pick the team and season to see the name.</p>
          )}
        </Card>

        {result && !result.ok ? (
          <Card accent="red"><p className="text-sm text-red">{result.error}</p></Card>
        ) : null}

        <button type="button" onClick={submit} disabled={!ready || pending} className={cx(button.primary, "justify-center py-3")}>
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving and uploading photos…</> : "Add to the website"}
        </button>
        {!ready && team && season ? (
          <p className="text-xs text-muted">{shortPhotos.length ? "Add the long-sleeve photos, or untick long sleeve." : "Add at least one short-sleeve photo."}</p>
        ) : null}
      </div>
    </div>
  );
}

function PhotoPicker({ label, hint, files, onChange }: { label: string; hint: string; files: File[]; onChange: (files: File[]) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="grid gap-2">
      <span className="text-sm font-bold text-ink">{label}</span>
      <span className="-mt-1.5 text-xs text-muted">{hint}</span>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a file not uploaded yet */}
            <img src={urls[i]} alt="" className="h-24 w-24 rounded-lg border border-line bg-white object-contain" />
            {i === 0 ? <span className="absolute bottom-1 start-1 rounded bg-pitch-fill px-1.5 text-[10px] font-bold text-white">MAIN</span> : null}
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -end-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-line bg-raised text-ink hover:bg-red-soft">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-lg border border-dashed border-line-2 text-muted hover:border-pitch hover:text-ink">
          <span className="grid justify-items-center gap-1 text-xs"><ImagePlus className="h-5 w-5" /> Add</span>
          <input type="file" accept="image/*" multiple className="sr-only"
            onChange={(e) => { onChange([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
        </label>
      </div>
    </div>
  );
}
