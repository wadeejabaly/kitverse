import { z } from "zod";

/** Shape of `price_list_versions.data` (edited in the admin, published as a new version). Amounts in whole ILS. */
const Audience = z.enum(["adult", "women", "kids"]);

export const PriceGroup = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  price: z.number().nonnegative(),
  match: z.object({
    version: z.enum(["fan", "player"]).optional(),
    sleeve: z.enum(["short", "long"]).optional(),
    era: z.enum(["current", "retro"]).optional(),
    audience: z.array(Audience).optional(),
    kit_with_shorts: z.boolean().optional(),
  }),
  source: z.string().optional(),
});

export const Addon = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  price: z.number().nonnegative(),
  per: z.enum(["shirt", "patch", "order"]),
  team_id: z.string().optional(),   // team-specific add-ons (gift boxes)
});

/**
 * Quantity bundle: once `min_qty` eligible shirts are in the cart, every eligible
 * shirt costs `unit_price[sleeve]` (3 short = 300, 3 long = 330, mixed = 300 + 10 per long,
 * each extra shirt 100 / 110). Add-ons and delivery are never included.
 */
export const Offer = z.object({
  id: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  active: z.boolean(),
  min_qty: z.number().int().positive(),
  eligible: z.object({
    version: z.enum(["fan", "player"]).optional(),
    era: z.enum(["current", "retro"]).optional(),
    audience: z.array(Audience).optional(),
  }),
  unit_price: z.object({ short: z.number().nonnegative(), long: z.number().nonnegative().optional() }),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});
export type Offer = z.infer<typeof Offer>;

export const DeliveryZone = z.object({
  id: z.string(),
  name_ar: z.string(),
  fee: z.number().nonnegative(),
  days: z.string(),
});

export const PriceListData = z.object({
  currency: z.literal("ILS"),
  groups: z.array(PriceGroup).min(1),
  addons: z.array(Addon),
  offers: z.array(Offer),
  delivery: z.object({ zones: z.array(DeliveryZone).min(1), days_excluded: z.string().optional() }).passthrough(),
  payment: z.object({
    cash_on_delivery: z.boolean(),
    paypal: z.boolean(),
    deposit: z.object({ enabled: z.boolean() }).passthrough(),
  }),
}).passthrough();

export type PriceListData = z.infer<typeof PriceListData>;
export type PriceGroup = z.infer<typeof PriceGroup>;
