import "server-only";
import type { PaymentProvider } from "@/lib/orders";

/**
 * Owner notification on an order — SERVER ONLY.
 *
 * Two moments send one: a card order becoming paid, and a cash-on-delivery
 * order being placed. COD notifies on creation because it has to — the owner
 * matches an incoming Bit transfer against an order they can only know about
 * from this email.
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
  badge: boolean;
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
    address: string;
    city: string;
    /** 'north' | 'center' | 'negev' | 'jerusalem', or "" for a pre-migration order. */
    region: string;
    country: string;
    notes: string | null;
  };
  items: NotificationItem[];
  subtotal: number;
  shipping: number;
  total: number;
  /**
   * Cash on delivery only: the Bit deposit the buyer was told to send. Null on
   * every card order. This is the figure the owner matches by hand against
   * their Bit account before flipping the row to `paid`.
   */
  deposit?: number | null;
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
 * badge is spelled out, along with the address to send it to and a phone
 * number for the courier.
 */
export function renderOrderSummary(order: OrderNotification): string {
  const cod = order.provider === "bit_cod";
  const deposit = order.deposit ?? 0;

  const lines: string[] = [];
  lines.push(
    cod
      ? `New CASH-ON-DELIVERY order — ${order.reference} — AWAITING BIT DEPOSIT`
      : `New paid order — ${order.reference}`,
  );
  if (cod) {
    lines.push("");
    lines.push(`  Bit deposit due   ILS ${deposit}`);
    lines.push(`  Cash on delivery  ILS ${order.total - deposit}`);
    lines.push(
      "  NOT SHIPPED YET. When the deposit lands in your Bit account, set this",
    );
    lines.push("  order's status to 'paid' in the Supabase dashboard.");
  }
  lines.push("");
  lines.push("ITEMS");
  for (const item of order.items) {
    lines.push(`  ${item.qty} x ${item.title}`);
    lines.push(`      size ${item.size} / ${item.version} version`);
    if (item.nameNumber) lines.push(`      print: ${item.nameNumber}`);
    if (item.badge) lines.push("      badge patch: yes");
    lines.push(`      unit ILS ${item.unitPrice} — line ILS ${item.unitPrice * item.qty}`);
  }
  lines.push("");
  lines.push(`Subtotal  ILS ${order.subtotal}`);
  lines.push(`Shipping  ILS ${order.shipping}`);
  lines.push(`TOTAL     ILS ${order.total}`);
  if (cod) {
    lines.push(`  of which deposit by Bit   ILS ${deposit}`);
    lines.push(`  collect in cash on delivery ILS ${order.total - deposit}`);
  }
  lines.push("");
  lines.push("SHIP TO");
  lines.push(`  ${order.customer.name}`);
  lines.push(`  ${order.customer.address}`);
  lines.push(`  ${order.customer.city}, ${order.customer.country}`);
  if (order.customer.region) lines.push(`  region: ${order.customer.region}`);
  lines.push(`  phone: ${order.customer.phone}`);
  lines.push(`  email: ${order.customer.email}`);
  if (order.customer.notes) lines.push(`  notes: ${order.customer.notes}`);
  lines.push("");
  lines.push("REFERENCES");
  lines.push(`  order id       ${order.orderId}`);
  lines.push(`  processor      ${order.provider}`);
  // COD has no processor references — printing two empty labels would only
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
    order.provider === "bit_cod"
      ? `KitVerse COD order ${order.reference} — Bit deposit ILS ${order.deposit ?? 0} of ILS ${order.total}`
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
