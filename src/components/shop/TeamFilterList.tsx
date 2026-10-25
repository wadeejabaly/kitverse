import { FilterCheckbox } from "@/components/shop/FilterRail";

/**
 * The team facet's checkbox list. Used to be a native `<select>`
 * (TeamSelect) — the one control among a hundred-odd teams that scrolled,
 * typed-to-jump and worked on a phone without any bespoke combobox. Converted
 * to checkboxes (2026-10-25, the owner's "let the filters be checkboxes"
 * ask) so every facet in the rail reads and behaves the same way, and because
 * checking several teams at once (Real Madrid *and* Barcelona) is something a
 * single-select dropdown could never do.
 *
 * That drops the one thing the native select gave for free — the OS doing the
 * scrolling — so this wraps its own list in a fixed-height, scrollable box
 * instead of letting a hundred rows push the whole sidebar down.
 *
 * No "use client": a checkbox here is a plain link, like every other facet in
 * the rail, so — unlike the old select, which needed useRouter to turn an
 * onChange into a navigation — this needs no client JS at all. State arrives
 * as plain strings from the server component that already read the search
 * params (a function prop could not cross that boundary anyway), and
 * `otherParams` is whatever OTHER filters the page wants preserved across a
 * team toggle: `/shop` passes `{ kind, league, season }`; a collection page
 * passes just `{ season }`, since kind/league are already fixed by the
 * collection itself and have no business on that URL.
 */
export function TeamFilterList({
  teams,
  selected,
  basePath,
  otherParams,
}: {
  teams: { slug: string; name: string; count: number }[];
  selected: string[];
  basePath: string;
  otherParams: Record<string, string[] | undefined>;
}) {
  function hrefFor(team: string): string {
    const query = new URLSearchParams();
    for (const [key, values] of Object.entries(otherParams)) {
      for (const value of values ?? []) {
        if (value) query.append(key, value);
      }
    }
    const nextSelected = selected.includes(team)
      ? selected.filter((entry) => entry !== team)
      : [...selected, team];
    for (const value of nextSelected) query.append("team", value);
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  return (
    <div className="flex max-h-72 flex-col gap-2.5 overflow-y-auto pe-1">
      {teams.map((team) => (
        <FilterCheckbox
          key={team.slug}
          href={hrefFor(team.slug)}
          checked={selected.includes(team.slug)}
          label={team.name}
          count={team.count}
        />
      ))}
    </div>
  );
}
