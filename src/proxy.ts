import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlProxy from "next-intl/middleware";
import { routing } from "./i18n/config";

/**
 * One proxy for two areas (Next 16: proxy.ts, export `proxy`):
 * - /admin: keep the staff session cookie fresh and bounce signed-out visitors to the login.
 *   Optimistic only - every admin page and action re-checks with requireStaff().
 * - everything else in the matcher: the storefront's locale routing (ar default, /en prefix).
 */
const handleIntlRouting = createIntlProxy(routing);

async function adminGuard(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const devBypass = process.env.NODE_ENV === "development" && process.env.KV_DEV_ADMIN === "1";
  const isLogin = request.nextUrl.pathname.startsWith("/admin/login");
  if (!data.user && !isLogin && !devBypass) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return response;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) return adminGuard(request);
  return handleIntlRouting(request);
}

export const config = {
  // Skip api routes, Next/Vercel internals, customer order pages (/o/...) and files with extensions.
  matcher: ["/admin/:path*", "/((?!api|trpc|_next|_vercel|admin|o/|.*\\..*).*)"],
};
