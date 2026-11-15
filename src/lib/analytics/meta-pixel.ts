/**
 * Meta Pixel (owner request 2026-11-15: "add it" - so Meta can see website orders and the
 * ads can be judged/optimized on purchases, not just clicks).
 *
 * The pixel only loads after the visitor accepts cookies (<MetaPixel/> in [locale]/layout.tsx,
 * gated on useConsent()), and only when NEXT_PUBLIC_META_PIXEL_ID is set (Vercel env).
 * Before that `fbq` doesn't exist and every call here is a silent no-op, so callers never
 * need to check consent themselves. Nothing personal is sent: event names, product handles,
 * the order value in ILS and the order number (as event id, for de-duplication).
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "";

type Fbq = (cmd: "track" | "trackCustom" | "init", name: string, params?: Record<string, unknown>, opts?: { eventID?: string }) => void;

function fbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  const f = (window as unknown as { fbq?: Fbq }).fbq;
  return typeof f === "function" ? f : null;
}

function call(name: string, params?: Record<string, unknown>, eventID?: string) {
  try {
    fbq()?.("track", name, params, eventID ? { eventID } : undefined);
  } catch {
    // tracking must never break the shop
  }
}

export const pixel = {
  pageView: () => call("PageView"),
  addToCart: (handle: string) => call("AddToCart", { content_ids: [handle], content_type: "product", currency: "ILS" }),
  initiateCheckout: (value: number, numItems: number) =>
    call("InitiateCheckout", { value: round2(value), currency: "ILS", num_items: numItems }),
  /** An order was placed on the site (cash on delivery / manual Bit or PayPal.Me, paid later). */
  purchase: (value: number, orderRef: string, handles: string[]) =>
    call("Purchase", { value: round2(value), currency: "ILS", content_ids: handles, content_type: "product", order_id: orderRef }, `order-${orderRef}`),
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
