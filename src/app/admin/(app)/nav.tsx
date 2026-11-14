"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard, ClipboardCheck, MessagesSquare, Package, Images, ImageOff, FlaskConical, Settings2, Bell, Layers, Truck, Percent,
  BarChart3, PiggyBank, Warehouse, Users, Boxes, PanelLeftClose, PanelLeftOpen, Menu, X,
} from "lucide-react";
import { cx, Wordmark } from "../ui";

type Item = { href: string; label: string; icon: typeof Bell; exact?: boolean };

/**
 * Admin navigation (admin redesign 2026-11-10): every existing page, grouped
 * by what the owner is doing - selling, the catalogue, Instagram, insights,
 * the system. Customers is the one new page; nothing was removed.
 */
const SECTIONS: { title?: string; items: Item[] }[] = [
  { items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    title: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", icon: Package },
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/orders/batches", label: "Supplier batches", icon: Truck },
      { href: "/admin/discounts", label: "Discounts", icon: Percent },
    ],
  },
  {
    title: "Catalog",
    items: [
      { href: "/admin/catalog", label: "Products", icon: Layers },
      { href: "/admin/photos", label: "Photos & shirts", icon: ImageOff },
      { href: "/admin/inventory", label: "Inventory", icon: Warehouse },
      { href: "/admin/pricing", label: "Pricing & shipping", icon: Boxes },
    ],
  },
  {
    title: "Instagram",
    items: [
      { href: "/admin/inbox", label: "Inbox", icon: MessagesSquare },
      { href: "/admin/approvals", label: "Approvals", icon: ClipboardCheck },
      { href: "/admin/media", label: "Posts", icon: Images },
      { href: "/admin/test-chat", label: "Test bot", icon: FlaskConical },
    ],
  },
  { title: "Insights", items: [{ href: "/admin/stats", label: "Analytics", icon: BarChart3 }, { href: "/admin/profit", label: "Profit", icon: PiggyBank }] },
  {
    title: "System",
    items: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/settings", label: "Settings & payments", icon: Settings2 },
    ],
  },
];
const ITEMS = SECTIONS.flatMap((s) => s.items);

/** Counts shown on a nav item, keyed by href. */
export type Badges = Record<string, number>;

/** The single best-matching item for a path (longest prefix wins: /admin/orders/batches is not "Orders"). */
function activeHref(path: string): string | null {
  let best: Item | null = null;
  for (const it of ITEMS) {
    const hit = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
    if (hit && (!best || it.href.length > best.href.length)) best = it;
  }
  return best?.href ?? null;
}

function NavList({ badges, collapsed, onNavigate }: { badges: Badges; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const on = activeHref(path);
  return (
    <div className="flex flex-col gap-5">
      {SECTIONS.map((s, si) => (
        <div key={si} className="flex flex-col gap-0.5">
          {s.title ? (
            collapsed ? <div className="mx-auto mb-1 h-px w-6 bg-line-2" /> : <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted/80">{s.title}</div>
          ) : null}
          {s.items.map((it) => {
            const active = on === it.href;
            const Icon = it.icon;
            const count = badges[it.href] ?? 0;
            return (
              <Link key={it.href} href={it.href} onClick={onNavigate} title={collapsed ? it.label : undefined} aria-current={active ? "page" : undefined}
                className={cx("group relative flex h-10 items-center gap-3 rounded-xl text-[14px] font-medium transition-colors",
                  collapsed ? "justify-center px-0" : "px-3",
                  active ? "bg-pitch-fill/15 text-ink" : "text-muted hover:bg-raised/70 hover:text-ink")}>
                {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-pitch-fill" /> : null}
                <span className="relative grid h-5 w-5 shrink-0 place-items-center">
                  <Icon className={cx("h-[18px] w-[18px]", active && "text-pitch")} strokeWidth={1.8} />
                  {collapsed && count ? <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-gold ring-2 ring-sidebar" /> : null}
                </span>
                {collapsed ? null : <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                {!collapsed && count ? <span className="rounded-full bg-gold px-1.5 text-[11px] font-bold leading-[18px] text-[#1a1406] tabular-nums">{count}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Desktop sidebar; collapse state is remembered in a cookie so the server renders it the same way. */
export function Sidebar({ badges, initialCollapsed, footer }: { badges: Badges; initialCollapsed: boolean; footer?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `kv_admin_nav=${next ? "collapsed" : "open"}; path=/admin; max-age=31536000; samesite=lax`;
  }
  return (
    <aside className={cx("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-sidebar/95 transition-[width] duration-200 ease-out lg:flex", collapsed ? "w-[76px]" : "w-[248px]")}>
      <div className={cx("flex h-[72px] items-center border-b border-line", collapsed ? "justify-center" : "justify-between px-5")}>
        <Wordmark compact={collapsed} />
      </div>
      <nav className={cx("min-h-0 flex-1 overflow-y-auto py-5", collapsed ? "px-2.5" : "px-3")} aria-label="Admin">
        <NavList badges={badges} collapsed={collapsed} />
      </nav>
      {collapsed ? null : footer}
      <button type="button" onClick={toggle} aria-label={collapsed ? "Expand menu" : "Collapse menu"}
        className={cx("flex h-12 items-center gap-2.5 border-t border-line text-[13px] text-muted transition-colors hover:text-ink", collapsed ? "justify-center" : "px-5")}>
        {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <><PanelLeftClose className="h-[18px] w-[18px]" /> Collapse</>}
      </button>
    </aside>
  );
}

/** Phone/tablet: a menu button that opens the full navigation as a drawer. */
export function MobileNav({ badges, footer }: { badges: Badges; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);
  const total = Object.values(badges).reduce((a, b) => a + b, 0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-line-2 bg-raised/50 text-ink lg:hidden">
        <Menu className="h-5 w-5" />
        {total ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-void" /> : null}
      </button>
      {/* portalled to <body>: the top bar's backdrop blur would otherwise trap this fixed layer inside the bar */}
      {open ? createPortal(
        <div className="admin-theme fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col border-r border-line bg-sidebar shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Wordmark />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5" aria-label="Admin">
              <NavList badges={badges} collapsed={false} onNavigate={() => setOpen(false)} />
            </nav>
            {footer}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

/** Phone quick bar for the five most used pages (kept from the old console). */
const MOBILE = ["/admin", "/admin/approvals", "/admin/inbox", "/admin/orders", "/admin/settings"];
const SHORT: Record<string, string> = { "/admin": "Home", "/admin/settings": "Settings" };
export function TabBar({ badges }: { badges: Badges }) {
  const path = usePathname();
  const on = activeHref(path);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick">
      <ul className="grid grid-cols-5">
        {ITEMS.filter((i) => MOBILE.includes(i.href)).map((it) => {
          const active = on === it.href;
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link href={it.href} className={cx("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-ink" : "text-muted")}>
                <Icon className={cx("h-[21px] w-[21px]", active && "text-pitch")} strokeWidth={active ? 2 : 1.7} />
                {SHORT[it.href] ?? it.label}
                {badges[it.href] ? <span className="absolute left-1/2 top-1.5 ml-2 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] font-bold leading-4 text-[#1a1406]">{badges[it.href]}</span> : null}
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
    <Link href="/admin/notifications" aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
      className={cx("relative grid h-10 w-10 place-items-center rounded-xl border border-line-2 transition-colors", path === "/admin/notifications" ? "bg-raised text-ink" : "bg-raised/40 text-muted hover:bg-raised hover:text-ink")}>
      <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
      {unread ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] font-bold leading-4 text-[#1a1406] tabular-nums">{unread}</span> : null}
    </Link>
  );
}
