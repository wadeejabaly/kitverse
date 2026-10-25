import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/** Customer order page links: /o/<order id>.<signature>. Unguessable, no login, no extra table. */
function sign(id: string) {
  const secret = env().ORDER_LINK_SECRET || env().SUPABASE_SERVICE_ROLE_KEY;
  return createHmac("sha256", secret).update(`order:${id}`).digest("base64url").slice(0, 22);
}

export const orderToken = (orderId: string) => `${orderId}.${sign(orderId)}`;
export const orderLink = (orderId: string) => `${env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/o/${orderToken(orderId)}`;

/** The order id if the token is genuine, else null. */
export function readOrderToken(token: string): string | null {
  const [id, sig] = decodeURIComponent(token).split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const want = Buffer.from(sign(id)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
