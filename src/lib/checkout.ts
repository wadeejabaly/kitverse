import { z } from "zod";
import { SIZES, VERSIONS } from "@/data/pricing";
import type { Size, Version } from "@/data/types";
import { NAME_NUMBER_MAX } from "@/lib/product";

/**
 * The checkout wire contract — shared by the browser form and the API routes.
 *
 * Deliberately dependency-light: this module must be safe to import from a
 * client component, so it pulls in Zod and two tiny constants and nothing
 * else. The catalogue lookup and the money recomputation live in
 * src/lib/orders.ts, which is server-side and imports catalog.json.
 *
 * Note what is NOT in the item schema: any price. The browser sends what the
 * customer chose; the server decides what it costs. A request carrying a
 * price field would simply have it ignored.
 */

export const MAX_CART_LINES = 40;

// Membership checks against the single source of truth in pricing.ts, so a
// new size can never be valid in the cart and invalid at checkout.
const SizeSchema = z.custom<Size>(
  (value) => typeof value === "string" && (SIZES as string[]).includes(value),
);
const VersionSchema = z.custom<Version>(
  (value) => typeof value === "string" && (VERSIONS as string[]).includes(value),
);

/** One cart line as it crosses the wire. Matches CartItem minus any money. */
export const CheckoutItemSchema = z.object({
  handle: z.string().min(1).max(120),
  size: SizeSchema,
  version: VersionSchema,
  nameNumber: z.string().max(NAME_NUMBER_MAX * 2).optional(),
  badge: z.boolean(),
  // Clamped rather than rejected server-side; the bound here is a sanity
  // ceiling so an absurd number never reaches the clamp.
  qty: z.number().int().min(1).max(1000),
});

export type CheckoutItemInput = z.infer<typeof CheckoutItemSchema>;

/**
 * Delivery details. Israel only at launch, so `country` is not a form field
 * at all — it is fixed to IL here and on the order row, which is honest about
 * what the store can actually ship.
 */
export const CustomerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  // Kept permissive on purpose: international dialling forms vary and a
  // rejected valid number costs a sale. The rule is "enough digits to be a
  // phone number", not a format.
  phone: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .regex(/^[+()\-\s0-9]+$/)
    .refine((value) => (value.match(/\d/g) ?? []).length >= 7),
  email: z.email().max(160),
  address: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(500).optional(),
});

export type CustomerInput = z.infer<typeof CustomerSchema>;

export const CreateOrderRequestSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1).max(MAX_CART_LINES),
  customer: CustomerSchema,
  locale: z.enum(["ar", "en"]),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const CaptureOrderRequestSchema = z.object({
  paypalOrderId: z.string().min(4).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

/** The country this store ships to at launch. Not a form field. */
export const FIXED_COUNTRY = "IL";

/**
 * Failure codes the API returns instead of prose. The browser maps each one
 * to a localized string (messages: checkout.errors.*), so an error message is
 * never an untranslated server string and never leaks internals.
 */
export type CheckoutErrorCode =
  | "invalid_request"
  | "cart_empty"
  | "payments_unconfigured"
  | "paypal_failed"
  | "order_not_found"
  | "capture_failed"
  | "rate_limited"
  | "server_error";

export interface CheckoutErrorBody {
  code: CheckoutErrorCode;
}

/** The customer-facing order reference: the first block of the order uuid. */
export function orderReference(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}
