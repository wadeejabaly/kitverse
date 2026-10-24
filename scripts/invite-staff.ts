/**
 * Invite an admin user (you or the owner). Supabase emails them a link; they choose their own password.
 *   npm run staff:invite -- --email someone@example.com --name "Raji" --role owner
 * Roles: owner | admin | staff. Re-running for an existing user just updates name/role.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const email = arg("--email"), name = arg("--name"), role = arg("--role") ?? "admin";
  if (!email || !name || !["owner", "admin", "staff"].includes(role)) {
    console.error('usage: npm run staff:invite -- --email you@example.com --name "Name" --role owner|admin|staff');
    process.exit(1);
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let userId: string | undefined;
  const inv = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/admin/auth/callback` });
  if (inv.error) {
    // already registered -> look them up
    const list = await db.auth.admin.listUsers({ perPage: 1000 });
    userId = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!userId) throw inv.error;
    console.log("user already exists - updating staff record");
  } else {
    userId = inv.data.user.id;
    console.log(`invite email sent to ${email} (link opens ${site}/admin/auth/callback)`);
  }
  const { error } = await db.from("staff_users").upsert({ id: userId, display_name: name, role }, { onConflict: "id" });
  if (error) throw error;
  console.log(`staff: ${name} (${role})`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
