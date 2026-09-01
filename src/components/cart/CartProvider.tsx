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
import type { CartItem, Size, Version } from "@/data/types";
import { NAME_NUMBER_MAX, sanitizeNameNumber } from "@/lib/product";

/**
 * The cart: client-side only, persisted to localStorage, prices never stored.
 *
 * Two rules shape this file.
 *
 * 1. Prices are NEVER persisted. A stored line is {handle, size, version,
 *    nameNumber, badge, qty} and nothing else — every figure the customer sees
 *    is recomputed from src/data/pricing.ts at render time, so a price change
 *    can never be stale in someone's browser and a tampered localStorage entry
 *    cannot move money.
 *
 * 2. Hydration safety. The server has no localStorage, so the first client
 *    render must match the server's HTML exactly: we start empty with
 *    `hydrated:false`, then read storage in an effect. Consumers that show a
 *    count render nothing (not "0") until `hydrated` is true, which keeps the
 *    header from flashing a wrong number.
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
 * A line's identity: the same shirt in the same size, version, personalisation
 * and badge choice is one line whose quantity grows. Change any option and it
 * is a different line, because it is a different physical product.
 */
export function lineKey(item: CartItem): string {
  return [
    item.handle,
    item.size,
    item.version,
    item.nameNumber ?? "",
    item.badge ? "badge" : "plain",
  ].join("|");
}

const SIZE_SET = new Set<string>(SIZES);
const VERSION_SET = new Set<string>(VERSIONS);

/**
 * Anything read back from localStorage is untrusted input — another tab, an
 * older release, or a hand-edited value. Parse defensively and drop whatever
 * does not fit the contract rather than rendering a broken cart.
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
    if (typeof value.handle !== "string" || value.handle === "") continue;
    if (typeof value.size !== "string" || !SIZE_SET.has(value.size)) continue;
    if (typeof value.version !== "string" || !VERSION_SET.has(value.version)) continue;

    const qtyRaw = typeof value.qty === "number" ? Math.floor(value.qty) : 1;
    const qty = Math.min(MAX_QTY, Math.max(1, qtyRaw));
    const nameNumber =
      typeof value.nameNumber === "string" && value.nameNumber.trim() !== ""
        ? sanitizeNameNumber(value.nameNumber).slice(0, NAME_NUMBER_MAX)
        : undefined;

    items.push({
      handle: value.handle,
      size: value.size as Size,
      version: value.version as Version,
      badge: value.badge === true,
      qty,
      ...(nameNumber ? { nameNumber } : {}),
    });
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
