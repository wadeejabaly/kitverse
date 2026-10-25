import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Invite / magic links land here: exchange the one-time code for a session, then choose a password. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/admin/set-password", req.url));
  }
  return NextResponse.redirect(new URL("/admin/login?error=link", req.url));
}
