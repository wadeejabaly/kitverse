import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlProxy from "next-intl/middleware";
import { routing } from "./i18n/config";
import { phoneLocale } from "./lib/phone-locale";

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

/**
 * First visit = the language of the visitor's phone (owner request 2026-11-16): an Arabic phone
 * gets the Arabic site, an English phone the English site, a Hebrew phone - and any other
 * language - the Hebrew site. Only ONCE per browser (no NEXT_LOCALE cookie yet), and the redirect
 * keeps the page and query (so ad links with UTM tags still land on the same page). After that the
 * URL the visitor opens is respected, the first-visit language picker and the header switch still
 * work and save the choice. Crawlers and link previews are never redirected (SEO / ad previews).
 */
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse/i;

function firstVisitRedirect(request: NextRequest): NextResponse | null {
  if (request.method !== "GET" || request.cookies.has("NEXT_LOCALE")) return null;
  if (BOT_UA.test(request.headers.get("user-agent") ?? "")) return null;
  const { pathname } = request.nextUrl;
  const m = pathname.match(/^\/(en|he)(?=\/|$)/);
  const current = (m?.[1] ?? "ar") as "ar" | "en" | "he";
  const target = phoneLocale(request.headers.get("accept-language"));
  const rest = m ? pathname.slice(m[0].length) || "/" : pathname;
  const url = request.nextUrl.clone();
  const res =
    target === current
      ? null
      : NextResponse.redirect(Object.assign(url, { pathname: target === "ar" ? rest : `/${target}${rest === "/" ? "" : rest}` }), 307);
  const out = res ?? handleIntlRouting(request);
  out.cookies.set("NEXT_LOCALE", target === current ? current : target, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return out;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) return adminGuard(request);
  return firstVisitRedirect(request) ?? handleIntlRouting(request);
}

export const config = {
  // Skip api routes, Next/Vercel internals, customer order pages (/o/...) and files with extensions.
  matcher: ["/admin/:path*", "/((?!api|trpc|_next|_vercel|admin|o/|.*\\..*).*)"],
};
