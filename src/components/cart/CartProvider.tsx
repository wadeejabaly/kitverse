"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SIZES, VERSIONS } from "@/data/pricing";
import type { AccessoryCartItem, CartItem, JerseyCartItem, PatchId, Size, Version } from "@/data/types";
import { NAME_NUMBER_MAX, sanitizeNameNumber } from "@/lib/product";
import { PATCHES } from "@/lib/orders/rules";

/**
 * The cart: client-side only, persisted to localStorage, prices never stored.
 *
 * Three rules shape this file.
 *
 * 1. Prices are NEVER persisted. A stored jersey line is {kind:"jersey",
 *    handle, size, version, nameNumber, patch, qty}; a stored accessory line
 *    is {kind:"accessory", handle, qty}. Every figure the customer sees is
 *    recomputed at render time (jersey lines from src/data/pricing.ts,
 *    accessory lines from src/data/accessories.ts), so a price change can
 *    never be stale in someone's browser and a tampered localStorage entry
 *    cannot move money.
 *
 * 2. Hydration safety. The server has no localStorage, so the first client
 *    render must match the server's HTML exactly: we start empty with
 *    `hydrated:false`, then read storage in an effect. Consumers that show a
 *    count render nothing (not "0") until `hydrated` is true, which keeps the
 *    header from flashing a wrong number.
 *
 * 3. Two kinds of line, one cart (2026-10-25, the Accessories/keychains ask).
 *    `kind` is the discriminant; everything in this file that doesn't care
 *    which kind a line is (count, qty clamp, storage round-trip) stays
 *    generic over `CartItem`, and only `lineKey` and `parseStoredCart` branch
 *    on it.
 */

const STORAGE_KEY = "kitverse-cart-v1";
const MAX_QTY = 10;

interface CartContextValue {
  items: CartItem[];
  /** Total number of shirts, not lines. */
  count: number;
  /** False until localStorage has been read — gate any count display on it. */
  hydrated: boolean;
  add: (item: CartItem) => void;
  remove: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * A line's identity. For a jersey: the same shirt in the same size, version,
 * personalisation and patch SET is one line whose quantity grows; change any
 * option and it is a different line, because it is a different physical
 * product. The patches are sorted before joining — price is by count, not
 * order, so {A,B} and {B,A} are the same line. For an accessory: there is
 * nothing to configure, so the handle alone is the identity — adding the
 * same keychain twice just grows its qty.
 */
export function lineKey(item: CartItem): string {
  if (item.kind === "accessory") return `accessory|${item.handle}`;
  const patches = [...item.patches].sort().join("+");
  return ["jersey", item.handle, item.size, item.version, item.nameNumber ?? "", patches].join("|");
}

const SIZE_SET = new Set<string>(SIZES);
const VERSION_SET = new Set<string>(VERSIONS);
const PATCH_ID_SET = new Set<string>(Object.keys(PATCHES));
/** Legacy single-value `Patch` → the new `PatchId[]` (a cart saved before 2026-10-26). */
const LEGACY_PATCH_MAP: Record<string, PatchId[]> = { none: [], league: ["league"], ucl: ["champions_league"], worldcup: ["world_cup"] };

function parseJerseyEntry(value: Record<string, unknown>): JerseyCartItem | null {
  if (typeof value.handle !== "string" || value.handle === "") return null;
  if (typeof value.size !== "string" || !SIZE_SET.has(value.size)) return null;
  if (typeof value.version !== "string" || !VERSION_SET.has(value.version)) return null;

  const qtyRaw = typeof value.qty === "number" ? Math.floor(value.qty) : 1;
  const qty = Math.min(MAX_QTY, Math.max(1, qtyRaw));
  const nameNumber =
    typeof value.nameNumber === "string" && value.nameNumber.trim() !== ""
      ? sanitizeNameNumber(value.nameNumber).slice(0, NAME_NUMBER_MAX)
      : undefined;
  // `patches: PatchId[]` replaced the single `patch` enum (owner decision
  // 2026-10-26) — which itself had replaced the old `badge: boolean` (owner
  // decision 2026-10-23). A cart saved by an earlier release has one of:
  //   - `patches: string[]` already (this release) — keep whatever is a
  //     known id, dropping anything that isn't (a removed/renamed id);
  //   - `patch: "none"|"league"|"ucl"|"worldcup"` (the single-value release)
  //     — map it through LEGACY_PATCH_MAP;
  //   - `badge: true/false` or neither (the original release) — `true`
  //     becomes the generic "league" patch, `false`/absent becomes none.
  const patches: PatchId[] = Array.isArray(value.patches)
    ? value.patches.filter((p): p is PatchId => typeof p === "string" && PATCH_ID_SET.has(p))
    : typeof value.patch === "string" && value.patch in LEGACY_PATCH_MAP
      ? LEGACY_PATCH_MAP[value.patch]
      : value.badge === true
        ? ["league"]
        : [];

  return {
    kind: "jersey",
    handle: value.handle,
    size: value.size as Size,
    version: value.version as Version,
    patches,
    qty,
    ...(nameNumber ? { nameNumber } : {}),
  };
}

function parseAccessoryEntry(value: Record<string, unknown>): AccessoryCartItem | null {
  if (typeof value.handle !== "string" || value.handle === "") return null;
  const qtyRaw = typeof value.qty === "number" ? Math.floor(value.qty) : 1;
  const qty = Math.min(MAX_QTY, Math.max(1, qtyRaw));
  return { kind: "accessory", handle: value.handle, qty };
}

/**
 * Anything read back from localStorage is untrusted input — another tab, an
 * older release, or a hand-edited value. Parse defensively and drop whatever
 * does not fit the contract rather than rendering a broken cart.
 *
 * `kind` is new (2026-10-25, the Accessories/keychains ask): a cart stored by
 * any earlier release has no `kind` field on any entry at all, because a
 * jersey line was the only kind of line that could ever exist — so an entry
 * with no `kind`, or any `kind` other than "accessory", is read as a jersey
 * line, same as always.
 */
function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const items: CartItem[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const value = entry as Record<string, unknown>;
    const parsedItem =
      value.kind === "accessory" ? parseAccessoryEntry(value) : parseJerseyEntry(value);
    if (parsedItem) items.push(parsedItem);
  }
  return items;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read once on mount — never during render, which would break hydration.
  useEffect(() => {
    try {
      setItems(parseStoredCart(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      // Private mode / storage disabled: the cart simply stays in memory.
    }
    setHydrated(true);
  }, []);

  // Write through on every change, but only after the initial read, so an
  // empty pre-hydration state can never overwrite a real stored cart.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full or unavailable — the in-memory cart still works.
    }
  }, [items, hydrated]);

  // Another tab changed the cart: keep this one in step.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      setItems(parseStoredCart(event.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((item: CartItem) => {
    const key = lineKey(item);
    setItems((current) => {
      const existing = current.findIndex((line) => lineKey(line) === key);
      if (existing === -1) {
        return [...current, { ...item, qty: Math.min(MAX_QTY, Math.max(1, item.qty)) }];
      }
      return current.map((line, index) =>
        index === existing
          ? { ...line, qty: Math.min(MAX_QTY, line.qty + item.qty) }
          : line,
      );
    });
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((line) => lineKey(line) !== key));
  }, []);

  const updateQty = useCallback((key: string, qty: number) => {
    const next = Math.min(MAX_QTY, Math.max(1, Math.floor(qty)));
    setItems((current) =>
      current.map((line) => (lineKey(line) === key ? { ...line, qty: next } : line)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((sum, line) => sum + line.qty, 0),
      hydrated,
      add,
      remove,
      updateQty,
      clear,
    }),
    [items, hydrated, add, remove, updateQty, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
}

export { MAX_QTY };
