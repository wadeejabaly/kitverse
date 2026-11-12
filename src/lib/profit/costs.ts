/**
 * Net profit (owner request 2026-11-13: "connect to Meta ads, see how much I spend and calculate net
 * profit for me - I want to see my profit in detail").
 *
 * Revenue comes from the orders (what the customer pays: the order total, discounts already taken off,
 * delivery fee included). COSTS are the owner's own numbers, typed once in admin Profit -> "Your costs"
 * and kept in `bot_settings` (key `profit_costs`, all money in agorot) - nothing here is guessed: a cost
 * left at 0 counts as 0, and the page says which costs are still empty. Ad spend comes from the Meta
 * Marketing API (src/lib/profit/meta-ads.ts); other expenses are typed by hand (`profit_expenses`).
 *
 * Pure functions only, so the numbers can be tested (costs.test.ts).
 */

export const PAY_METHODS = ["cod", "bit_personal", "paypal_me", "paypal", "bit"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export interface Fee {
  /** percent of the order total, e.g. 3.4 */
  pct: number;
  /** fixed agorot per order */
  fixed: number;
}

export interface Costs {
  /**
   * The currency the SUPPLIER fields below are in (owner's sheet 2026-11-13 is in US dollars), and the
   * shekels per dollar used to convert them. Supplier fields are in that currency's cents.
   */
  supplierCurrency: "ILS" | "USD";
  usdRate: number;
  // ---- supplier prices (in supplierCurrency, cents) ----
  /** one shirt */
  shirtFan: number;
  shirtPlayer: number;
  shirtRetro: number;
  /** extra for long sleeve, per shirt */
  longSleeveExtra: number;
  /** extra for 3XL / 4XL, per shirt */
  bigSizeExtra: number;
  /** a kids set (shirt + shorts) */
  kidsSet: number;
  /** an adult set (shirt + shorts) */
  adultSet: number;
  /** printing a name + number, per shirt */
  nameNumber: number;
  /** one patch */
  patch: number;
  /** shipping from the supplier to Israel, per shirt */
  supplierShippingPerShirt: number;
  // ---- in shekels (agorot) ----
  giftBox: number;
  keychain: number;
  scarf: number;
  /** what the courier charges to deliver one order, north zone / every other zone */
  deliveryNorth: number;
  deliveryOther: number;
  /** payment / collection fees by payment method */
  fees: Record<PayMethod, Fee>;
}

/** Fields priced by the supplier (converted with usdRate when supplierCurrency is USD). */
export const SUPPLIER_FIELDS = ["shirtFan", "shirtPlayer", "shirtRetro", "longSleeveExtra", "bigSizeExtra", "kidsSet", "adultSet", "nameNumber", "patch", "supplierShippingPerShirt"] as const;
/** Fields always in shekels. */
export const ILS_FIELDS = ["giftBox", "scarf", "keychain", "deliveryNorth", "deliveryOther"] as const;

export const EMPTY_COSTS: Costs = {
  supplierCurrency: "ILS", usdRate: 0,
  shirtFan: 0, shirtPlayer: 0, shirtRetro: 0, longSleeveExtra: 0, bigSizeExtra: 0, kidsSet: 0, adultSet: 0, nameNumber: 0, patch: 0, supplierShippingPerShirt: 0,
  giftBox: 0, keychain: 0, scarf: 0, deliveryNorth: 0, deliveryOther: 0,
  fees: { cod: { pct: 0, fixed: 0 }, bit_personal: { pct: 0, fixed: 0 }, paypal_me: { pct: 0, fixed: 0 }, paypal: { pct: 0, fixed: 0 }, bit: { pct: 0, fixed: 0 } },
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** The stored settings value -> Costs (missing or broken fields = 0). */
export function parseCosts(value: unknown): Costs {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: Costs = { ...EMPTY_COSTS, fees: { ...EMPTY_COSTS.fees } };
  for (const k of [...SUPPLIER_FIELDS, ...ILS_FIELDS]) out[k] = Math.round(num(v[k]));
  // the first version had one delivery cost for every zone
  if (!v.deliveryNorth && !v.deliveryOther && num(v.deliveryPerOrder)) out.deliveryNorth = out.deliveryOther = Math.round(num(v.deliveryPerOrder));
  out.supplierCurrency = v.supplierCurrency === "USD" ? "USD" : "ILS";
  out.usdRate = Math.min(20, num(v.usdRate));
  const fees = (v.fees && typeof v.fees === "object" ? v.fees : {}) as Record<string, { pct?: unknown; fixed?: unknown } | undefined>;
  for (const m of PAY_METHODS) out.fees[m] = { pct: Math.min(100, num(fees[m]?.pct)), fixed: Math.round(num(fees[m]?.fixed)) };
  return out;
}

/** Which of the main costs are still 0 - shown as a warning, since profit is overstated until they are filled. */
export function missingCosts(c: Costs): string[] {
  const out: string[] = [];
  if (!c.shirtFan) out.push("fan shirt");
  if (!c.shirtPlayer) out.push("player shirt");
  if (!c.shirtRetro) out.push("retro shirt");
  if (!c.supplierShippingPerShirt) out.push("shipping from the supplier");
  if (!c.deliveryNorth || !c.deliveryOther) out.push("delivery to the customer");
  if (c.supplierCurrency === "USD" && !c.usdRate) out.push("dollar rate");
  return out;
}

export interface OrderForProfit {
  id: string;
  number: number;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  payment_method: string | null;
  gift_boxes: number;
  /** delivery zone id from the order's quote ("north", "center", ...), null when unknown */
  zone: string | null;
  items: { qty: number; version: string; sleeve: string; retro: boolean; print: boolean; patches: number; box: boolean; size?: string; audience?: string; set?: boolean }[];
  accessories: { category: string; qty: number }[];
}

export interface OrderProfit {
  revenue: number;
  shirts: number;
  /** shirt cost + long-sleeve extra */
  productCost: number;
  /** names/numbers + patches */
  customisationCost: number;
  /** gift boxes + keychains + scarves */
  extrasCost: number;
  supplierShipping: number;
  delivery: number;
  paymentFee: number;
  totalCost: number;
  profit: number;
}

/** Profit of one order before ads and other expenses. */
export function orderProfit(o: OrderForProfit, c: Costs): OrderProfit {
  // supplier prices -> agorot
  const rate = c.supplierCurrency === "USD" ? c.usdRate : 1;
  const sup = (cents: number) => Math.round(cents * rate);
  let shirts = 0, productCost = 0, customisationCost = 0, extrasCost = 0;
  for (const it of o.items) {
    const q = Math.max(0, it.qty);
    shirts += q;
    const base = it.audience === "kids" ? c.kidsSet || c.shirtFan
      : it.set ? c.adultSet || c.shirtFan
      : it.retro ? c.shirtRetro : it.version === "player" ? c.shirtPlayer : c.shirtFan;
    const big = it.size === "3XL" || it.size === "4XL" ? c.bigSizeExtra : 0;
    productCost += q * sup(base + (it.sleeve === "long" ? c.longSleeveExtra : 0) + big);
    customisationCost += q * sup((it.print ? c.nameNumber : 0) + it.patches * c.patch);
    if (it.box) extrasCost += q * c.giftBox;
  }
  extrasCost += Math.max(0, o.gift_boxes) * c.giftBox;
  for (const a of o.accessories) extrasCost += Math.max(0, a.qty) * (a.category === "scarf" ? c.scarf : a.category === "keychain" ? c.keychain : 0);
  const supplierShipping = shirts * sup(c.supplierShippingPerShirt);
  const delivery = o.zone === "north" ? c.deliveryNorth : c.deliveryOther;
  const fee = c.fees[(o.payment_method ?? "cod") as PayMethod] ?? { pct: 0, fixed: 0 };
  const paymentFee = Math.round((o.total * fee.pct) / 100) + fee.fixed;
  const totalCost = productCost + customisationCost + extrasCost + supplierShipping + delivery + paymentFee;
  return { revenue: o.total, shirts, productCost, customisationCost, extrasCost, supplierShipping, delivery, paymentFee, totalCost, profit: o.total - totalCost };
}

export interface Expense {
  id: string;
  /** YYYY-MM-DD (Israel day) */
  date: string;
  label: string;
  /** agorot */
  amount: number;
}

export function parseExpenses(value: unknown): Expense[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is Expense => !!e && typeof e === "object" && typeof (e as Expense).id === "string" && /^\d{4}-\d{2}-\d{2}$/.test((e as Expense).date)
      && typeof (e as Expense).label === "string" && Number.isFinite((e as Expense).amount))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** "₪95" / "95.5" / "95,50" -> agorot; null for anything that isn't a non-negative amount. */
export function shekelsToAgorot(input: string): number | null {
  const t = input.replace(/[₪\s]/g, "").replace(",", ".");
  if (!t) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
