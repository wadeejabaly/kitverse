import { Link } from "@/i18n/navigation";
import { Figure } from "@/components/shared/Money";

/**
 * The filter rail's building blocks — a labelled group of facet checkboxes,
 * and one checkbox within it. Originally private to `/shop`; pulled out here
 * (2026-10-25) so `/shop/[collection]` can share the exact same look and
 * behaviour for its own team/year rail rather than re-implementing it.
 * Neither component knows about URLs or facet logic — both pages build their
 * own `href`s (via `shopHref`/`collectionHref`, toggling one value in/out of
 * that facet's array) and counts, and just hand them in.
 */
export function FilterGroup({
  label,
  id,
  children,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    // The group label sits above its own hairline rather than floating over
    // the options: the rail reads as a set of small indexes, which is what it
    // is, and the eye can find the group boundaries without any boxes.
    <div id={id} className="scroll-mt-32">
      <span className="mono-eyebrow mb-3 block border-b border-rule pb-3 text-ink-soft">
        {label}
      </span>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

/**
 * One facet checkbox. Still a link, not an `<input type="checkbox">` with an
 * onChange — the filter is a URL, not component state (2026-10-25: every
 * facet became multi-select, but the "no client-side filter state anywhere"
 * rule from the original single-select rail didn't change, so each checkbox
 * is a link to the URL you'd have *after* toggling it). It LOOKS and reads as
 * a checkbox (role="checkbox", aria-checked, a drawn box that fills when
 * checked) and can be ticked without leaving the keyboard, but clicking it is
 * a normal navigation — shareable, back/forward-safe, open-in-new-tab-safe,
 * exactly like the plain links it replaced.
 *
 * `label` takes a full node, not just a string — most facets (team, league,
 * kind) pass plain text, but a season/year option needs the same bidi
 * isolation `count` already gets below (`<Season value={...}/>` from
 * shared/Money, the same wrapper product cards use for "2026/27").
 */
export function FilterCheckbox({
  href,
  checked,
  label,
  count,
}: {
  href: string;
  checked: boolean;
  label: React.ReactNode;
  count: number;
}) {
  return (
    <Link
      href={href}
      role="checkbox"
      aria-checked={checked}
      className={`flex items-center justify-between gap-2.5 text-start text-sm transition-colors ${
        checked ? "text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors ${
            checked ? "border-ink bg-ink" : "border-rule"
          }`}
        >
          {checked ? (
            <svg
              viewBox="0 0 10 10"
              className="h-2 w-2 text-ground"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 5.2 3.8 7.5 8.5 2.5" />
            </svg>
          ) : null}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="mono-eyebrow latin shrink-0 text-ink-soft">
        <Figure>{count}</Figure>
      </span>
    </Link>
  );
}
