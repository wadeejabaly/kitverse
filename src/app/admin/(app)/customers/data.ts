import "server-only";
import { db } from "@/lib/db";

export type CustomerRow = {
  id: string; full_name: string | null; display_name: string | null; ig_username: string | null; ig_user_id: string | null;
  phone: string | null; email: string | null; created_at: string; is_blocked: boolean | null; tags: string[] | null;
};

/** Every customer (paged - the API returns at most 1000 rows per request). Test-bot ("sim:") customers are left out. */
export async function allCustomers(): Promise<CustomerRow[]> {
  const out: CustomerRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await db().from("customers").select("id,full_name,display_name,ig_username,ig_user_id,phone,email,created_at,is_blocked,tags")
      .order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw new Error(`customers: ${error.message}`);
    out.push(...((data ?? []) as CustomerRow[]));
    if (!data || data.length < 1000) break;
  }
  return out.filter((c) => !c.ig_user_id?.startsWith("sim:"));
}

export const displayName = (c: Pick<CustomerRow, "full_name" | "display_name" | "ig_username">) =>
  c.full_name || c.display_name || (c.ig_username ? `@${c.ig_username}` : "Unnamed customer");

