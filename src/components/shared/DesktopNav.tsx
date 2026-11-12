"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { NavColumn, NavEntry, NavLink, NavPanel } from "@/lib/nav-data";

/**
 * The header's six-entry navigation from 900px up (owner request 2026-11-12): Shop, National teams,
 * Classics, Leagues, Accessories, More. Dropdowns are dark-navy panels with gold accents (the
 * homepage's own --flood-* tokens, .kv-nav-* in globals.css).
 *
 * Opening rules, so it works with a mouse, a finger and a keyboard alike:
 *  - mouse: hover opens (short close delay so the pointer can travel to the panel);
 *  - touch / pen (tablets): the first tap on a trigger opens its panel instead of navigating, a second
 *    tap follows the link;
 *  - keyboard: focus inside an entry opens it, Escape closes and returns focus to the trigger.
 * Any navigation, a click outside, or Escape closes everything.
 */
export function DesktopNav({ entries, label }: { entries: NavEntry[]; label: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const lastPointer = useRef<string>("mouse");
  const navRef = useRef<HTMLElement>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(null), 160);
  }, []);

  useEffect(() => setOpen(null), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const trigger = navRef.current?.querySelector<HTMLElement>(`[data-nav-trigger="${open}"]`);
      setOpen(null);
      trigger?.focus();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => cancelClose, []);

  return (
    <nav ref={navRef} aria-label={label} className="hidden min-w-0 flex-1 justify-center nav:flex">
      <ul className="flex items-center gap-1 xl:gap-2">
        {entries.map((entry) => {
          const isOpen = open === entry.id;
          const active = isActive(entry, pathname);
          const panelId = `kv-nav-panel-${entry.id}`;
          return (
            <li
              key={entry.id}
              className={entry.panel?.layout === "compact" ? "relative" : "static"}
              onPointerEnter={(event) => {
                lastPointer.current = event.pointerType;
                if (event.pointerType !== "mouse" || !entry.panel) return;
                cancelClose();
                setOpen(entry.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse" && entry.panel) closeSoon();
              }}
              onFocus={() => {
                if (!entry.panel) return;
                cancelClose();
                setOpen(entry.id);
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null) && open === entry.id) setOpen(null);
              }}
            >
              <Trigger
                entry={entry}
                isOpen={isOpen}
                active={active}
                panelId={panelId}
                onTap={(event) => {
                  if (!entry.panel) return;
                  const touchLike = lastPointer.current !== "mouse";
                  // no link ("More"), or a finger's first tap: open/close the panel instead of navigating
                  if (!entry.href || (touchLike && !isOpen)) {
                    event.preventDefault();
                    cancelClose();
                    setOpen(isOpen ? null : entry.id);
                  }
                }}
              />
              {entry.panel ? <Panel id={panelId} panel={entry.panel} open={isOpen} label={entry.label} /> : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function isActive(entry: NavEntry, pathname: string): boolean {
  return (entry.match ?? []).some((m) => (m.endsWith("$") ? pathname === m.slice(0, -1) : pathname === m || pathname.startsWith(`${m}/`) || pathname.startsWith(`${m}?`)));
}

function Trigger({
  entry,
  isOpen,
  active,
  panelId,
  onTap,
}: {
  entry: NavEntry;
  isOpen: boolean;
  active: boolean;
  panelId: string;
  onTap: (event: React.MouseEvent) => void;
}) {
  const common = {
    "data-nav-trigger": entry.id,
    "data-active": active || undefined,
    className: "kv-nav-trigger",
    onClick: onTap,
    ...(entry.panel ? { "aria-expanded": isOpen, "aria-controls": panelId } : {}),
  };
  const body = (
    <>
      <span>{entry.label}</span>
      {entry.panel ? <Chevron /> : null}
    </>
  );
  if (!entry.href) return <button type="button" {...common}>{body}</button>;
  return (
    <Link href={entry.href} {...common} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  );
}

function Panel({ id, panel, open, label }: { id: string; panel: NavPanel; open: boolean; label: string }) {
  return (
    <div
      id={id}
      data-open={open}
      data-layout={panel.layout}
      // the bridge: a transparent strip above the panel keeps the pointer "inside" on its way down
      className="kv-nav-drop"
    >
      <div className="kv-nav-panel" role="region" aria-label={label}>
        <div className="kv-nav-columns" data-count={panel.columns.length}>
          {panel.columns.map((column, index) => (
            <Column key={index} column={column} />
          ))}
        </div>
        {panel.cta ? (
          <div className="kv-nav-cta-row">
            <ItemLink link={panel.cta} className="kv-nav-cta">
              {panel.cta.label}
              <span aria-hidden className="kv-nav-cta-arrow">←</span>
            </ItemLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Column({ column }: { column: NavColumn }) {
  return (
    <div className="kv-nav-column">
      {column.heading ? (
        column.heading.href ? (
          <Link href={column.heading.href} className="kv-nav-heading kv-nav-heading-link">
            {column.heading.label}
          </Link>
        ) : (
          <span className="kv-nav-heading">{column.heading.label}</span>
        )
      ) : null}
      <ul className="kv-nav-list" style={column.flow ? ({ "--kv-flow": column.flow } as React.CSSProperties) : undefined} data-flow={column.flow ? "" : undefined}>
        {column.links.map((link) => (
          <li key={link.href}>
            <ItemLink link={link} className="kv-nav-link">
              {link.label}
            </ItemLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemLink({ link, className, children }: { link: NavLink; className: string; children: React.ReactNode }) {
  if (link.plain) {
    return (
      <a href={link.href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {children}
    </Link>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="kv-nav-chevron">
      <path d="M3.5 6 8 10.5 12.5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
