/**
 * Removes test data before go-live: simulator chats, the local webhook test user (E2E_*),
 * their orders/approvals/runs, and notifications. Real Instagram customers are never touched.
 *   npm run db:clean-tests            (dry run - shows counts)
 *   npm run db:clean-tests -- --yes   (delete)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });

async function main() {
  const yes = process.argv.includes("--yes");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: custs } = await db.from("customers").select("id,ig_user_id").or("ig_user_id.like.sim:%,ig_user_id.like.E2E_%");
  const ids = (custs ?? []).map((c) => c.id);
  const { data: convs } = ids.length ? await db.from("conversations").select("id").in("customer_id", ids) : { data: [] };
  const convIds = (convs ?? []).map((c) => c.id);
  const { data: orders } = ids.length ? await db.from("orders").select("id").in("customer_id", ids) : { data: [] };
  const orderIds = (orders ?? []).map((o) => o.id);
  console.log(`test customers ${ids.length}, conversations ${convIds.length}, orders ${orderIds.length}`);
  if (!yes) { console.log("dry run - add --yes to delete"); return; }
  if (orderIds.length) {
    for (const t of ["order_events", "adjustments", "payments", "invoices", "cash_collections", "issues"]) await db.from(t).delete().in("order_id", orderIds);
    await db.from("approvals").update({ order_id: null }).in("order_id", orderIds);
    await db.from("order_items").delete().in("order_id", orderIds);
    await db.from("orders").delete().in("id", orderIds);
  }
  if (convIds.length) {
    await db.from("approvals").delete().in("conversation_id", convIds);
    await db.from("agent_runs").delete().in("conversation_id", convIds);
    await db.from("conversations").delete().in("id", convIds);
  }
  if (ids.length) await db.from("customers").delete().in("id", ids);
  await db.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("availability_answers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("test data removed");
}

main().catch((e) => { console.error(e); process.exit(1); });
