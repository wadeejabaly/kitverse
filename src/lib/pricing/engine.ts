/**
 * Pricing engine - the ONLY place prices are computed. The bot quotes whatever
 * this returns and never does arithmetic itself. Pure function: no I/O.
 * All results are in agorot (integer); the price list itself is in whole ILS.
 */
import type { PriceListData, PriceGroup, Offer } from "./schema";
import { tieredTotal } from "./tiers";

export type Audience = "adult" | "women" | "kids";
export type Version = "fan" | "player";
export type Sleeve = "short" | "long";
export type Era = "current" | "retro";

export interface CartItem {
  key: string;                 // caller's id for the line (order_item id or temp id)
  title: string;               // for the breakdown text
  audience: Audience;
  version: Version;
  sleeve: Sleeve;
  era: Era;
  kitWithShorts?: boolean;
  size: string;                // 'S'..'4XL' or kids sizes
  qty: number;
  printNameNumber?: boolean;   // name and/or number printed
  patches?: number;            // number of patches on this shirt
  boxAddonId?: string;         // e.g. 'box_real' (per order, counted once per id)
}

export interface Adjustment { label: string; amount: number /* agorot, positive = discount */ }

export interface QuoteInput {
  items: CartItem[];
  zoneId?: string | null;      // delivery zone; null = not known yet
  adjustments?: Adjustment[];  // approved discounts / discount codes (already validated)
  orderAddons?: { id: string; qty: number }[]; // per-order extras with a quantity (e.g. gift boxes)
  now?: Date;
}

export interface QuoteLine {
  key: string;
  title: string;
  qty: number;
  groupId: string;
  groupPrice: number;          // list price per shirt (agorot)
  unitPrice: number;           // after offer (agorot)
  addons: { id: string; label: string; amount: number }[];
  lineTotal: number;           // (unitPrice + per-shirt addons) * qty
  offerId: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  orderAddons: { id: string; label: string; amount: number }[];
  offer: { id: string; label: string; eligibleQty: number; saving: number } | null;
  itemsTotal: number;          // shirts + per-shirt add-ons + order add-ons
  discountTotal: number;
  delivery: { zoneId: string; label: string; fee: number; days: string } | null;
  total: number;               // itemsTotal - discounts + delivery
  missing: ("zone" | "items")[];
  /** Arabic breakdown in the owner's style, e.g. "300 البلايز / 60 الاسماء / 50 توصيل = 410₪" */
  summaryAr: string;
}

export class PricingError extends Error {}

const A = (ils: number) => Math.round(ils * 100);
export const toIls = (agorot: number) => agorot / 100;
const fmt = (agorot: number) => {
  const v = agorot / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

function groupFor(item: CartItem, groups: PriceGroup[]): PriceGroup {
  // kits (shirt + shorts) first, then the most specific matching group
  const isAdultKit = !!item.kitWithShorts && item.audience !== "kids"; // kids items are always kits
  const candidates = groups.filter((g) => {
    const m = g.match;
    if ((m.kit_with_shorts ?? false) !== isAdultKit) return false;
    if (m.audience && !m.audience.includes(item.audience)) return false;
    if (m.version && m.version !== item.version) return false;
    if (m.sleeve && m.sleeve !== item.sleeve) return false;
    if (m.era && m.era !== item.era) return false;
    return true;
  });
  // women's cut only exists as fan version -> priced as fan
  if (!candidates.length && item.audience === "women") {
    return groupFor({ ...item, audience: "adult", version: "fan" }, groups);
  }
  if (!candidates.length) throw new PricingError(`no price group for ${item.title} (${item.audience}/${item.version}/${item.sleeve}/${item.era})`);
  const specificity = (g: PriceGroup) => Object.values(g.match).filter((v) => v !== undefined).length;
  return candidates.sort((a, b) => specificity(b) - specificity(a))[0];
}

function offerApplies(o: Offer, item: CartItem, now: Date): boolean {
  if (!o.active) return false;
  if (o.starts_at && now < new Date(o.starts_at)) return false;
  if (o.ends_at && now > new Date(o.ends_at)) return false;
  const e = o.eligible;
  if (item.kitWithShorts) return false;
  if (e.version && e.version !== item.version) return false;
  if (e.era && e.era !== item.era) return false;
  if (e.audience && !e.audience.includes(item.audience)) return false;
  if (item.sleeve === "long" && o.unit_price.long === undefined) return false;
  return true;
}

function sizeAddon(size: string, addons: PriceListData["addons"]) {
  const s = size.toUpperCase().replace(/\s/g, "");
  const id = s === "3XL" || s === "XXXL" ? "size_3xl" : s === "4XL" || s === "XXXXL" ? "size_4xl" : null;
  return id ? addons.find((a) => a.id === id) ?? null : null;
}

export function quote(list: PriceListData, input: QuoteInput): Quote {
  const now = input.now ?? new Date();
  const items = input.items.filter((i) => i.qty > 0);
  for (const i of items) if (!Number.isInteger(i.qty) || i.qty > 50) throw new PricingError(`bad qty for ${i.title}`);
  const addon = (id: string) => list.addons.find((a) => a.id === id) ?? null;

  // one active offer at a time: the one that saves the most
  let best: { offer: Offer; eligible: CartItem[]; saving: number } | null = null;
  for (const o of list.offers) {
    const eligible = items.filter((i) => offerApplies(o, i, now));
    const qty = eligible.reduce((s, i) => s + i.qty, 0);
    if (qty < o.min_qty) continue;
    const saving = eligible.reduce((s, i) => {
      const unit = A(i.sleeve === "long" ? o.unit_price.long! : o.unit_price.short);
      return s + Math.max(0, A(groupFor(i, list.groups).price) - unit) * i.qty;
    }, 0);
    if (!best || saving > best.saving) best = { offer: o, eligible, saving };
  }

  const lines: QuoteLine[] = items.map((i) => {
    const g = groupFor(i, list.groups);
    const groupPrice = A(g.price);
    const inOffer = best?.eligible.includes(i) ?? false;
    const unitPrice = inOffer
      ? Math.min(groupPrice, A(i.sleeve === "long" ? best!.offer.unit_price.long! : best!.offer.unit_price.short))
      : groupPrice;
    const adds: QuoteLine["addons"] = [];
    const nn = addon("name_number");
    if (i.printNameNumber && nn) adds.push({ id: nn.id, label: nn.name_ar, amount: A(nn.price) });
    const patch = addon("patch");
    // Tiered (owner decision 2026-10-26): the 1st patch on a shirt costs
    // patch.price_tiers[0], the 2nd price_tiers[1], etc - NOT a flat
    // price × count. A×tieredTotal(...) would round each tier separately and
    // could drift by a cent across patches, so the sum is taken in ILS first
    // and rounded to agorot once, same as every other money figure here.
    if (i.patches && i.patches > 0 && patch) {
      const amount = A(tieredTotal(patch.price_tiers, patch.price, i.patches));
      adds.push({ id: patch.id, label: `${patch.name_ar} ×${i.patches}`, amount });
    }
    const sz = sizeAddon(i.size, list.addons);
    if (sz) adds.push({ id: sz.id, label: sz.name_ar, amount: A(sz.price) });
    const perShirt = adds.reduce((s, a) => s + a.amount, 0);
    return {
      key: i.key, title: i.title, qty: i.qty, groupId: g.id, groupPrice, unitPrice,
      addons: adds, lineTotal: (unitPrice + perShirt) * i.qty, offerId: inOffer ? best!.offer.id : null,
    };
  });

  const orderAddons = [...new Set(items.map((i) => i.boxAddonId).filter(Boolean) as string[])].map((id) => {
    const a = addon(id);
    if (!a) throw new PricingError(`unknown add-on ${id}`);
    return { id, label: a.name_ar, amount: A(a.price) };
  });
  for (const x of input.orderAddons ?? []) {
    if (!x.qty) continue;
    const a = addon(x.id);
    if (!a || a.per !== "order") throw new PricingError(`unknown order add-on ${x.id}`);
    if (!Number.isInteger(x.qty) || x.qty < 0 || x.qty > 10) throw new PricingError(`bad qty for ${x.id}`);
    orderAddons.push({ id: a.id, label: x.qty > 1 ? `${a.name_ar} ×${x.qty}` : a.name_ar, amount: A(a.price) * x.qty });
  }

  const itemsTotal = lines.reduce((s, l) => s + l.lineTotal, 0) + orderAddons.reduce((s, a) => s + a.amount, 0);
  const discountTotal = Math.min(itemsTotal, (input.adjustments ?? []).reduce((s, a) => s + Math.max(0, a.amount), 0));

  let delivery: Quote["delivery"] = null;
  if (input.zoneId) {
    const z = list.delivery.zones.find((z) => z.id === input.zoneId);
    if (!z) throw new PricingError(`unknown delivery zone ${input.zoneId}`);
    delivery = { zoneId: z.id, label: z.name_ar, fee: A(z.fee), days: z.days };
  }

  const missing: Quote["missing"] = [];
  if (!items.length) missing.push("items");
  if (!delivery) missing.push("zone");
  const total = itemsTotal - discountTotal + (delivery?.fee ?? 0);

  // owner-style Arabic summary
  const shirts = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const names = lines.reduce((s, l) => s + (l.addons.find((a) => a.id === "name_number")?.amount ?? 0) * l.qty, 0);
  const patches = lines.reduce((s, l) => s + (l.addons.find((a) => a.id === "patch")?.amount ?? 0) * l.qty, 0);
  const sizes = lines.reduce((s, l) => s + l.addons.filter((a) => a.id.startsWith("size_")).reduce((x, a) => x + a.amount, 0) * l.qty, 0);
  const parts = [`${fmt(shirts)} البلايز`];
  if (names) parts.push(`${fmt(names)} الاسماء`);
  if (patches) parts.push(`${fmt(patches)} الشارات`);
  if (sizes) parts.push(`${fmt(sizes)} مقاسات كبيرة`);
  for (const a of orderAddons) parts.push(`${fmt(a.amount)} ${a.label}`);
  if (discountTotal) parts.push(`-${fmt(discountTotal)} خصم`);
  if (delivery) parts.push(`${fmt(delivery.fee)} توصيل`);
  const summaryAr = `${parts.join(" / ")} = ${fmt(total)}₪${delivery ? " واصل لباب البيت" : " (بدون توصيل)"}`;

  return {
    lines, orderAddons,
    offer: best ? { id: best.offer.id, label: best.offer.name_ar, eligibleQty: best.eligible.reduce((s, i) => s + i.qty, 0), saving: best.saving } : null,
    itemsTotal, discountTotal, delivery, total, missing, summaryAr,
  };
}
