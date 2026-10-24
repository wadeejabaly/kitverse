/** Output checks on the bot's reply before it is sent. Pure (unit-tested). */
import type { PriceListData } from "../pricing/schema";
import type { Quote } from "../pricing/engine";

const CURRENCY = "(?:₪|شيكل|شيقل|شواقل|ש\"ח|שקל|nis|ils|shekels?)";

/** Amounts the reply states as money ("300₪", "₪ 300", "300 شيكل"). */
export function moneyAmounts(text: string): number[] {
  const t = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${CURRENCY}|${CURRENCY}\\s*(\\d+(?:[.,]\\d+)?)`, "giu");
  return [...t.matchAll(re)].map((m) => Number((m[1] ?? m[2]).replace(",", ".")));
}

/** Every amount the bot is allowed to state: price-list values and the current quote's numbers. */
export function allowedAmounts(list: PriceListData, quote: Quote | null): Set<number> {
  const s = new Set<number>([400]); // "an original costs about 400"
  list.groups.forEach((g) => s.add(g.price));
  list.addons.forEach((a) => s.add(a.price));
  list.delivery.zones.forEach((z) => s.add(z.fee));
  for (const o of list.offers) {
    for (const u of [o.unit_price.short, o.unit_price.long].filter((x): x is number => x !== undefined)) {
      s.add(u); s.add(u * o.min_qty);
    }
  }
  if (quote) {
    const a = (x: number) => s.add(x / 100);
    a(quote.total); a(quote.itemsTotal); a(quote.discountTotal); if (quote.delivery) a(quote.delivery.fee);
    a(quote.itemsTotal - quote.discountTotal);
    for (const l of quote.lines) { a(l.unitPrice); a(l.groupPrice); a(l.lineTotal); a(l.unitPrice * l.qty); l.addons.forEach((x) => { a(x.amount); a(x.amount * l.qty); }); }
    quote.orderAddons.forEach((x) => a(x.amount));
    if (quote.offer) a(quote.offer.saving);
    // the owner-style summary's partial sums
    for (const m of quote.summaryAr.matchAll(/(\d+(?:\.\d+)?)/g)) s.add(Number(m[1]));
  }
  return s;
}

export function unexpectedAmounts(text: string, allowed: Set<number>): number[] {
  return moneyAmounts(text).filter((n) => !allowed.has(n));
}

/** Split the final text into separate DM bubbles (blank-line separated), max 4, dropping empties. */
export function toBubbles(text: string): string[] {
  const parts = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 4) return parts;
  return [...parts.slice(0, 3), parts.slice(3).join("\n")];
}

export const isNoReply = (text: string) => /^\s*<no_reply>\s*$/.test(text);

/** The customer-facing text: the last <reply>…</reply> block (model notes outside it are dropped). */
export function extractReply(raw: string): { text: string; tagged: boolean } {
  const all = [...raw.matchAll(/<reply>([\s\S]*?)<\/reply>/g)];
  if (all.length) return { text: all[all.length - 1][1].trim(), tagged: true };
  const open = raw.lastIndexOf("<reply>");
  if (open >= 0) return { text: raw.slice(open + 7).trim(), tagged: true }; // cut off before </reply>
  return { text: raw.trim(), tagged: false };
}

const arabicShare = (s: string) => {
  const letters = s.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /[؀-ۿ]/.test(c)).length / letters.length : 0;
};

/**
 * Arabic-speaking customer but the reply contains English sentences (3+ lowercase English words in a row).
 * Names/numbers/sizes in capitals ("MBAPPE 10", "XXL", "Player") are fine.
 */
export function wrongLanguage(reply: string, customerTexts: string[]): boolean {
  const customer = customerTexts.join(" ");
  if (arabicShare(customer) < 0.6) return false;
  return reply.split("\n").some((line) => /\b[a-z][a-z']+\s+[a-z][a-z']+\s+[a-z][a-z']+\b/.test(line));
}

/** Internal text that must never reach a customer (tool names, notes about "the customer", turn/tool talk). */
const META = /\b(?:search_catalog|send_product_photos|send_more_photos|add_to_order|update_order_line|remove_order_line|set_delivery_town|get_quote|set_customer_details|confirm_order|create_payment_link|get_order_status|check_availability|request_owner|handoff_to_owner|recommend_size|tool(?:s|_use)?|this turn|the customer|system prompt|state block|<\/?\w+>)\b/i;
export const looksLikeMeta = (text: string) => META.test(text.replace(/<no_reply>/g, ""));
