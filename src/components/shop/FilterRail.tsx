import { Link } from "@/i18n/navigation";
import { Figure } from "@/components/shared/Money";

/**
 * The filter rail's two building blocks — a labelled group of facet links,
 * and one facet option within it. Originally private to `/shop`; pulled out
 * here (2026-10-25) so `/shop/[collection]` can share the exact same look
 * and behaviour for its own team/year rail rather than re-implementing it.
 * Neither component knows about URLs or facet logic — both pages build
 * their own `href`s (via `shopHref`/`collectionHref`) and counts, and just
 * hand them in.
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
 * One facet option. A link, not a button: the filter is a URL, so it should
 * be openable in a new tab and crawlable like any other listing.
 *
 * `label` takes a full node, not just a string — most facets (team, league,
 * kind) pass plain text, but a season/year option needs the same bidi
 * isolation `count` already gets below (`<Season value={...}/>` from
 * shared/Money, the same wrapper product cards use for "2026/27").
 */
export function FilterLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: React.ReactNode;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`flex justify-between gap-2.5 text-start text-sm transition-colors ${
        active ? "text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      <span>
        {active ? <span aria-hidden className="me-2">—</span> : null}
        {label}
      </span>
      <span className="mono-eyebrow latin text-ink-soft">
        <Figure>{count}</Figure>
      </span>
    </Link>
  );
}
