"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardCheck, MessagesSquare, Package, Images, ImageOff, FlaskConical, Settings2, Bell, Layers, Truck, Percent, BarChart3, Warehouse } from "lucide-react";
import { cx } from "../ui";

const GROUPS = [
  [
    { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/approvals", label: "Approvals", icon: ClipboardCheck },
    { href: "/admin/inbox", label: "Inbox", icon: MessagesSquare },
    { href: "/admin/orders", label: "Orders", icon: Package },
    { href: "/admin/inventory", label: "Inventory", icon: Warehouse },
    { href: "/admin/stats", label: "Stats", icon: BarChart3 },
  ],
  [
    { href: "/admin/media", label: "Posts", icon: Images },
    { href: "/admin/photos", label: "Photos", icon: ImageOff },
    { href: "/admin/catalog", label: "Catalog", icon: Layers },
    { href: "/admin/pricing", label: "Pricing", icon: Truck },
    { href: "/admin/discounts", label: "Discounts", icon: Percent },
    { href: "/admin/test-chat", label: "Test bot", icon: FlaskConical },
  ],
  [{ href: "/admin/settings", label: "Settings", icon: Settings2 }],
];
const ITEMS = GROUPS.flat() as { href: string; label: string; icon: typeof Bell; exact?: boolean }[];
/** Counts shown as a dot / number on a nav item, keyed by href. */
export type Badges = Record<string, number>;
const MOBILE = ["/admin", "/admin/approvals", "/admin/inbox", "/admin/orders", "/admin/settings"];

function active(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

/** Icon rail that expands into a full labelled menu on hover (owner request
 * 2026-11-04: the old per-icon tooltip only ever named the one icon under
 * the pointer, so reading the rail meant hovering each icon in turn. `group`
 * now lives on the <nav> itself — CSS :hover propagates up through the DOM
 * tree to every ancestor of whatever's under the pointer, so hovering ANY
 * item (a descendant of <nav>) keeps <nav> itself :hover, which is what lets
 * one `hover:w-60` on <nav> widen the whole rail no matter which row the
 * mouse is actually over, while `group-hover:opacity-100` reveals every
 * label at once. Collapsed, the labels are both clipped by nav's own
 * `overflow-hidden` and opacity-0, so there's no stray sliver of text —
 * belt and braces. Rows are `w-full` (not the old centered icon-only
 * squares) so every row's icon sits at the same fixed offset whether the
 * rail is 84px or 240px wide, and the group divider is a full-width border
 * on the row instead of the old fixed-width `w-10` line sized for icons
 * only. */
export function Rail({ badges }: { badges: Badges }) {
  const path = usePathname();
  return (
    <nav className="group hidden w-[84px] shrink-0 flex-col gap-0 overflow-hidden border-r border-line py-5 transition-[width] duration-200 ease-out hover:w-60 md:flex">
      {GROUPS.map((group, gi) => (
        <div key={gi} className={cx("flex w-full flex-col gap-1", gi > 0 && "mt-4 border-t border-line-2 pt-4")}>
          {(group as typeof ITEMS).map((it) => {
            const on = active(path, it.href, it.exact);
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} aria-label={it.label}
                className={cx("flex h-11 w-full shrink-0 items-center gap-3 rounded-lg pl-5 pr-3 transition-colors", on ? "bg-raised text-ink ring-1 ring-line-2" : "text-muted hover:bg-raised hover:text-ink")}>
                <span className="relative grid h-5 w-5 shrink-0 place-items-center">
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                  {badges[it.href] ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-pitch ring-2 ring-paper" /> : null}
                </span>
                <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  {it.label}{badges[it.href] ? <span className="ml-1.5 text-pitch">{badges[it.href]}</span> : null}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function TabBar({ badges }: { badges: Badges }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {ITEMS.filter((i) => MOBILE.includes(i.href)).map((it) => {
          const on = active(path, it.href, it.exact);
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link href={it.href} className={cx("relative flex flex-col items-center gap-1 py-2.5 text-[11px]", on ? "text-ink" : "text-muted")}>
                <Icon className={cx("h-[22px] w-[22px]", on && "text-pitch")} strokeWidth={on ? 2 : 1.6} />
                {it.label}
                {badges[it.href] ? <span className="absolute left-1/2 top-1.5 ml-2 min-w-4 rounded-full bg-pitch-fill px-1 text-center text-[10px] font-semibold leading-4 text-white">{badges[it.href]}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BellLink({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <Link href="/admin/notifications" aria-label="Notifications"
      className={cx("relative grid h-9 w-9 place-items-center rounded-lg transition-colors", path === "/admin/notifications" ? "bg-raised text-ink" : "text-muted hover:bg-raised hover:text-ink")}>
      <Bell className="h-5 w-5" strokeWidth={1.6} />
      {unread ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-pitch ring-2 ring-void" /> : null}
    </Link>
  );
}
