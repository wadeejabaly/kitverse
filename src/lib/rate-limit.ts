import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { env } from "./env";

/**
 * Small failure counter for public lookups (order tracking), kept as rows in audit_log so it needs
 * no extra table. Keys are hashed with the order-link secret: no phone number or IP is stored.
 */
const hash = (key: string) => createHash("sha256").update(`${env().ORDER_LINK_SECRET}:${key}`).digest("hex").slice(0, 32);

/** True when any key has `limit` or more recorded failures in the last `windowMs`. */
export async function overLimit(action: string, checks: { key: string; limit: number; windowMs: number }[]): Promise<boolean> {
  for (const c of checks) {
    const since = new Date(Date.now() - c.windowMs).toISOString();
    const r = await db().from("audit_log").select("id", { count: "exact", head: true }).eq("action", action).eq("entity_id", hash(c.key)).gte("created_at", since);
    if ((r.count ?? 0) >= c.limit) return true;
  }
  return false;
}

export async function recordFailure(action: string, keys: string[]) {
  await db().from("audit_log").insert(keys.map((k) => ({ actor_kind: "system", action, entity: "rate_limit", entity_id: hash(k) })));
}
