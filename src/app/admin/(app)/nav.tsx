"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardCheck, MessagesSquare, Package, Images, ImageOff, FlaskConical, Settings2, Bell } from "lucide-react";
import { cx } from "../ui";

const GROUPS = [
  [
    { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/approvals", label: "Approvals", icon: ClipboardCheck, badge: true },
    { href: "/admin/inbox", label: "Inbox", icon: MessagesSquare },
    { href: "/admin/orders", label: "Orders", icon: Package },
  ],
  [
    { href: "/admin/media", label: "Posts", icon: Images },
    { href: "/admin/photos", label: "Photos", icon: ImageOff },
    { href: "/admin/test-chat", label: "Test bot", icon: FlaskConical },
  ],
  [{ href: "/admin/settings", label: "Settings", icon: Settings2 }],
];
const ITEMS = GROUPS.flat() as { href: string; label: string; icon: typeof Bell; exact?: boolean; badge?: boolean }[];
const MOBILE = ["/admin", "/admin/approvals", "/admin/inbox", "/admin/orders", "/admin/settings"];

function active(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

/** Icon rail with hover labels, grouped by dividers. */
export function Rail({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="hidden w-[84px] shrink-0 flex-col items-center gap-0 border-r border-line py-5 md:flex">
      {GROUPS.map((group, gi) => (
        <div key={gi} className={cx("flex flex-col items-center gap-2", gi > 0 && "mt-4 border-t border-line-2 pt-4 w-10")}>
          {(group as typeof ITEMS).map((it) => {
            const on = active(path, it.href, it.exact);
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} aria-label={it.label}
                className={cx("group relative grid h-11 w-11 place-items-center rounded-lg transition-colors", on ? "bg-raised text-ink ring-1 ring-line-2" : "text-muted hover:bg-raised hover:text-ink")}>
                <Icon className="h-5 w-5" strokeWidth={1.6} />
                {it.badge && pending ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-pitch ring-2 ring-paper" /> : null}
                <span className="pointer-events-none absolute left-full z-30 ml-3 whitespace-nowrap rounded-md border border-line-2 bg-raised px-2 py-1 text-xs text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {it.label}{it.badge && pending ? <span className="ml-1.5 text-pitch">{pending}</span> : null}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function TabBar({ pending }: { pending: number }) {
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
                {it.badge && pending ? <span className="absolute left-1/2 top-1.5 ml-2 min-w-4 rounded-full bg-pitch-fill px-1 text-center text-[10px] font-semibold leading-4 text-white">{pending}</span> : null}
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
