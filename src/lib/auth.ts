import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { db } from "./db";

export interface Staff { id: string | null; display_name: string; role: "owner" | "admin" | "staff"; locale: "ar" | "en" }

/**
 * Every admin page and server action calls this. Signed-out or non-staff -> login page.
 * Local-only escape hatch for building the UI: NODE_ENV=development AND KV_DEV_ADMIN=1
 * (can never be active in a production build).
 */
export async function requireStaff(): Promise<Staff> {
  if (process.env.NODE_ENV === "development" && process.env.KV_DEV_ADMIN === "1") {
    return { id: null, display_name: "Dev", role: "owner", locale: "ar" };
  }
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) redirect("/admin/login");
  const staff = (await db().from("staff_users").select("id,display_name,role,locale").eq("id", data.user.id).maybeSingle()).data as Staff | null;
  if (!staff) redirect("/admin/login?error=not_staff");
  return staff;
}
