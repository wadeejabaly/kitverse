import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The orders database — SERVER ONLY.
 *
 * `import "server-only"` on line 1 is the enforcement, not a comment: if any
 * client component ever imports this module (directly or through a chain),
 * the build fails rather than shipping a service-role key to a browser.
 *
 * The key this client uses bypasses Row Level Security, which is exactly why
 * the schema (supabase/migrations/0001_orders.sql) has RLS on with zero
 * policies: the service role is the ONLY way into the orders tables, and the
 * service role only ever runs inside an API route.
 *
 * Missing env is a first-class state, not an error. The store must build and
 * run with no environment at all, so the factory returns null and checkout
 * renders its "payments not configured" panel instead of crashing.
 */

let cached: SupabaseClient | null = null;

function readEnv(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/** True when both Supabase variables are present. */
export function isSupabaseConfigured(): boolean {
  return readEnv() !== null;
}

/**
 * The admin client, or null in demo mode (no Supabase env). Cached across
 * invocations on a warm server — createClient does no network work, but a
 * single instance keeps its connection reuse.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;
  const env = readEnv();
  if (!env) return null;

  cached = createClient(env.url, env.serviceRoleKey, {
    auth: {
      // A server has no session to persist and no user to refresh a token for.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

/** The columns this application reads back from `orders`. */
export interface OrderRow {
  id: string;
  /**
   * 'awaiting_deposit' (migration 0004) is retired — the application no
   * longer writes it (owner decision 2026-10-23 replaced the Bit-deposit rail
   * with plain cash on delivery, which uses 'pending' like a card order) —
   * but the column keeps allowing it for any pre-existing row.
   */
  status: "pending" | "awaiting_deposit" | "paid" | "failed" | "cancelled";
  /**
   * 'paypal' | 'payplus' — added in migration 0002, defaulted to 'paypal' —
   * plus 'bit_cod' from migration 0004 (retired, kept for old rows) and
   * 'cash' from migration 0005 (owner decision 2026-10-23).
   */
  payment_provider: string | null;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  payplus_page_request_uid: string | null;
  payplus_transaction_uid: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  /**
   * Added in migration 0005, replacing the single free-text `address` field
   * (owner decision 2026-10-23). `address` itself stays in the schema and is
   * still written, concatenated from these two, for anything still reading
   * the old column — but street/house_number are what the application reads.
   */
  street: string | null;
  house_number: string | null;
  address: string | null;
  city: string | null;
  /** Added in migration 0003. NULL on any order written before it. */
  delivery_region: string | null;
  country: string | null;
  notes: string | null;
  locale: string | null;
  subtotal_ils: number | null;
  shipping_ils: number | null;
  /** Added in migration 0005: the checkout-only gift-box add-on. */
  gift_box_qty: number | null;
  gift_box_ils: number | null;
  total_ils: number | null;
}

/** The columns this application reads back from `order_items`. */
export interface OrderItemRow {
  handle: string | null;
  title_snapshot: string | null;
  size: string | null;
  version: string | null;
  name_number: string | null;
  /**
   * Added in migration 0005, replacing the old `badge` boolean (owner
   * decision 2026-10-23): 'league' | 'ucl' | null. The `badge` column stays
   * in the schema for old rows but is no longer written.
   */
  patch: string | null;
  unit_price_ils: number | null;
  qty: number | null;
}
