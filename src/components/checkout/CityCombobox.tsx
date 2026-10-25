"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TOWN_OPTIONS, type TownOption } from "@/data/localities";

/**
 * City field with an as-you-type dropdown, filtered against the Arabic, Hebrew AND English name
 * of every town (so a customer can type in whichever script is fastest for them — common here,
 * per CLAUDE.md: Arabic-speaking customers with Hebrew loanwords). Picking a row sets the field
 * instantly, with no round trip — the shipping tier is already known client-side (src/data/localities.ts).
 *
 * This never REPLACES the server check: free-typed text that matches nothing here still goes
 * through CheckoutView's existing debounced POST /api/checkout/resolve-city, the same fuzzy match
 * the bot uses. This dropdown is a faster path for the common case, not the only path — a town
 * missing from this file (or added to the database after it was generated) still works.
 */
export function CityCombobox({
  id,
  label,
  value,
  invalid,
  error,
  locale,
  onChange,
  onBlur,
  onSelectTown,
}: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  error: string;
  /** Picks which of the town's 3 names fills the field on selection — "ar"/"he" show that
   *  script, anything else (including plain "en") falls back to the English name. */
  locale: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onSelectTown: (town: TownOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 1) return [];
    return TOWN_OPTIONS.filter(
      (t) => t.en.toLowerCase().includes(q) || t.ar.includes(value.trim()) || t.he.includes(value.trim()),
    ).slice(0, 8);
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => setActiveIndex(0), [value]);

  function select(town: TownOption) {
    const displayName = locale === "ar" ? town.ar : locale === "he" ? town.he : town.en;
    onChange(displayName);
    onSelectTown(town);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const className = `w-full border bg-field px-3.5 py-3 text-sm text-ink ${invalid ? "border-ink" : "border-rule"}`;

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mono-eyebrow mb-2 block text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        name="city"
        type="text"
        autoComplete="address-level2"
        value={value}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Let a click on a listbox row register before the listbox unmounts.
          setTimeout(onBlur, 120);
        }}
        onKeyDown={onKeyDown}
        className={className}
      />
      {open && matches.length > 0 ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto border border-rule bg-tile shadow-lg"
        >
          {matches.map((town, index) => (
            <li key={town.en} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(town)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-start ${
                  index === activeIndex ? "bg-chip" : ""
                }`}
              >
                <span className="flex flex-col">
                  <span dir="rtl" className="text-sm text-ink">{town.ar}</span>
                  <span className="flex gap-2 text-xs text-ink-soft">
                    <span dir="ltr">{town.en}</span>
                    <span dir="rtl">{town.he}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {invalid ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-ink-soft">
          {error}
        </p>
      ) : null}
    </div>
  );
}
