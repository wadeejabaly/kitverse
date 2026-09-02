"use client";

import { useRouter } from "@/i18n/navigation";
import { shopHref } from "@/lib/shop-href";

/**
 * The team filter. A native <select> rather than a bespoke combobox: with a
 * hundred-odd teams it is the control that already scrolls, types to jump and
 * behaves correctly on a phone, and it mirrors for RTL without any help.
 *
 * The current filter state arrives as plain strings from the server component
 * that already read the search params (a function prop could not cross that
 * boundary), so nothing here needs useSearchParams and the rail stays outside
 * any Suspense boundary.
 */
export function TeamSelect({
  teams,
  selected,
  kind,
  league,
  label,
  allLabel,
}: {
  teams: { slug: string; name: string; count: number }[];
  selected: string | null;
  kind: string | null;
  league: string | null;
  label: string;
  allLabel: string;
}) {
  const router = useRouter();

  return (
    <select
      aria-label={label}
      value={selected ?? ""}
      onChange={(event) =>
        router.push(shopHref({ kind, league, team: event.target.value || null }))
      }
      className="w-full border border-rule bg-tile px-3 py-2.5 text-sm text-ink"
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
