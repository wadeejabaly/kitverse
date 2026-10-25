"use client";

import { useRouter } from "@/i18n/navigation";

/**
 * The team filter. A native <select> rather than a bespoke combobox: with a
 * hundred-odd teams it is the control that already scrolls, types to jump and
 * behaves correctly on a phone, and it mirrors for RTL without any help.
 *
 * The current filter state arrives as plain strings from the server component
 * that already read the search params (a function prop could not cross that
 * boundary), so nothing here needs useSearchParams and the rail stays outside
 * any Suspense boundary.
 *
 * Reused by `/shop/[collection]` as well as `/shop` itself (2026-10-25) — so
 * rather than hard-coding `shopHref`'s kind/league shape, this takes the
 * page's own `basePath` ("/shop" or "/shop/<slug>") plus whatever OTHER
 * filters that page wants preserved across a team change, as a plain
 * serializable object (still no function prop crossing the server/client
 * boundary). `/shop` passes `{ kind, league, season }`; a collection page
 * passes just `{ season }`, since kind/league are already fixed by the
 * collection itself and have no business on that URL.
 */
export function TeamSelect({
  teams,
  selected,
  basePath,
  otherParams,
  label,
  allLabel,
}: {
  teams: { slug: string; name: string; count: number }[];
  selected: string | null;
  basePath: string;
  otherParams: Record<string, string | null | undefined>;
  label: string;
  allLabel: string;
}) {
  const router = useRouter();

  function hrefFor(team: string | null): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(otherParams)) {
      if (value) query.set(key, value);
    }
    if (team) query.set("team", team);
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  return (
    <select
      aria-label={label}
      value={selected ?? ""}
      onChange={(event) => router.push(hrefFor(event.target.value || null))}
      className="w-full border border-rule bg-field px-3 py-2.5 text-sm text-ink"
    >
      <option value="">{allLabel}</option>
      {teams.map((team) => (
        <option key={team.slug} value={team.slug}>
          {team.name} ({team.count})
        </option>
      ))}
    </select>
  );
}
