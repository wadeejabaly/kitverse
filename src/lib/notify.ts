import "server-only";
import type { PaymentProvider } from "@/lib/orders";

/**
 * Owner notification on an order — SERVER ONLY.
 *
 * Two moments send one: a card order becoming paid, and a cash-on-delivery
 * order being placed. Cash notifies on creation, like the card rails do on
 * payment, because that is the moment something worth packing has happened —
 * there is no later "paid" moment to wait for; the money changes hands at
 * the door.
 *
 * THE ONE RULE: this must never affect the money path. A capture that
 * succeeded has taken the customer's money and the order is paid whether or
 * not an email goes out; failing the response because an email provider had a
 * bad minute would tell a paying customer their order failed. So every export
 * here resolves, never rejects, and callers invoke it fire-and-forget.
 *
 * Resend is called over plain fetch — one POST, no SDK, no dependency. Absent
 * env (no key, no recipient, no verified sender) is a supported state: the
 * summary is logged to the server console instead, so a demo deployment still
 * shows the owner what an order looks like.
 *
 * The endpoint below is Resend's own API host, not this site's domain, so it
 * cannot derive from getSiteUrl(); scripts/preflight.mjs allows exactly this
 * host in exactly this file.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface NotificationItem {
  title: string;
  handle: string;
  size: string;
  version: string;
  nameNumber: string | null;
  /** 'none' | 'league' | 'ucl' — the official-patch add-on (replaces `badge`). */
  patch: "none" | "league" | "ucl";
  unitPrice: number;
  qty: number;
}

export interface OrderNotification {
  reference: string;
  orderId: string;
  locale: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    street: string;
    houseNumber: string;
    city: string;
    /** 'north' | 'center' | 'negev' | 'jerusalem', or "" for a pre-migration order. */
    region: string;
    country: string;
    notes: string | null;
  };
  items: NotificationItem[];
  subtotal: number;
  shipping: number;
  /** The checkout-only gift-box add-on (owner decision 2026-10-23). */
  giftBoxQty: number;
  giftBox: number;
  total: number;
  /** Which rail this order is on — the store runs three. */
  provider: PaymentProvider;
  /** The processor's id for the attempt: a PayPal order, a PayPlus page. "" for COD. */
  providerOrderRef: string;
  /** The processor's id for the money: a PayPal capture, a PayPlus transaction. "" for COD. */
  providerPaymentRef: string;
}

function config(): { apiKey: string; to: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_NOTIFY_EMAIL;
  const from = process.env.ORDER_NOTIFY_FROM;
  if (!apiKey || !to || !from) return null;
  return { apiKey, to, from };
}

/**
 * The whole order as plain text. Deliberately complete: the owner packs and
 * ships from this message, so every line's size, version, printed name and
 * patch is spelled out, along with the address to send it to and a phone
 * number for the courier.
 */
export function renderOrderSummary(order: OrderNotification): string {
  const cash = order.provider === "cash";

  const lines: string[] = [];
  lines.push(
    cash
      ? `New CASH-ON-DELIVERY order — ${order.reference} — PAID TO COURIER ON ARRIVAL`
      : `New paid order — ${order.reference}`,
  );
  if (cash) {
    lines.push("");
    lines.push(`  Collect in cash on delivery   ILS ${order.total}`);
    lines.push("  No deposit — the full amount is paid to the courier.");
  }
  lines.push("");
  lines.push("ITEMS");
  for (const item of order.items) {
    lines.push(`  ${item.qty} x ${item.title}`);
    lines.push(`      size ${item.size} / ${item.version} version`);
    if (item.nameNumber) lines.push(`      print: ${item.nameNumber}`);
    if (item.patch === "league") lines.push("      patch: league (official)");
    if (item.patch === "ucl") lines.push("      patch: Champions League");
    lines.push(`      unit ILS ${item.unitPrice} — line ILS ${item.unitPrice * item.qty}`);
  }
  if (order.giftBoxQty > 0) {
    lines.push(`  ${order.giftBoxQty} x Gift box`);
    lines.push(`      line ILS ${order.giftBox}`);
  }
  lines.push("");
  lines.push(`Subtotal   ILS ${order.subtotal}`);
  lines.push(`Shipping   ILS ${order.shipping}`);
  if (order.giftBoxQty > 0) lines.push(`Gift box   ILS ${order.giftBox}`);
  lines.push(`TOTAL      ILS ${order.total}`);
  lines.push("");
  lines.push("SHIP TO");
  lines.push(`  ${order.customer.name}`);
  lines.push(`  ${order.customer.street} ${order.customer.houseNumber}`.trimEnd());
  lines.push(`  ${order.customer.city}, ${order.customer.country}`);
  if (order.customer.region) lines.push(`  region: ${order.customer.region}`);
  lines.push(`  phone: ${order.customer.phone}`);
  lines.push(`  email: ${order.customer.email}`);
  if (order.customer.notes) lines.push(`  notes: ${order.customer.notes}`);
  lines.push("");
  lines.push("REFERENCES");
  lines.push(`  order id       ${order.orderId}`);
  lines.push(`  processor      ${order.provider}`);
  // Cash has no processor references — printing two empty labels would only
  // look like something failed.
  if (order.providerOrderRef) lines.push(`  payment page   ${order.providerOrderRef}`);
  if (order.providerPaymentRef) {
    lines.push(`  payment ref    ${order.providerPaymentRef}`);
  }
  lines.push(`  locale         ${order.locale}`);
  return lines.join("\n");
}

/**
 * Send the owner their order — a paid card order, or a cash-on-delivery order
 * the moment it is placed. Resolves in every case: a thrown error here would
 * be an unhandled rejection in a fire-and-forget call site.
 */
export async function notifyOwnerOfOrder(order: OrderNotification): Promise<void> {
  const summary = renderOrderSummary(order);
  const settings = config();

  if (!settings) {
    console.info(`[notify] email not configured — order summary follows\n${summary}`);
    return;
  }

  const subject =
    order.provider === "cash"
      ? `KitVerse cash-on-delivery order ${order.reference} — ILS ${order.total}`
      : `KitVerse order ${order.reference} — ILS ${order.total}`;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: settings.from,
        to: [settings.to],
        reply_to: order.customer.email,
        subject,
        text: summary,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(
        `[notify] Resend rejected the order email (${response.status}) for ${order.reference}`,
      );
    }
  } catch (error) {
    console.error(
      `[notify] order email failed for ${order.reference}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
