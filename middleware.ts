import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase persistă sesiunea în cookie-uri `sb-<ref>-auth-token` (uneori fragmentate `.0`, `.1`).
 * Nu folosim createServerClient / getSession / getUser aici — fiecare request la `/api/*` și pagini
 * declanșa reîmprospătări și lovea quota-ul `/auth/v1/token` (429). Sesiunea se citește în
 * Route Handlers și RSC prin `createServerClient()` din `lib/supabase/server.ts`.
 */
function hasLikelySupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => {
    const n = c.name;
    return n.startsWith("sb-") && /^sb-.+-auth-token(\.\d+)?$/.test(n);
  });
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;
  const isLocalhost = host === "localhost:3000" || host === "127.0.0.1:3000";
  const isStaticAsset =
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    /\.(ico|png|jpg|jpeg|svg|gif|webp|avif|woff|woff2|ttf|eot)$/.test(pathname);

  /** Fără apel Supabase: doar euristică cookie (redirect înainte de HTML). */
  const isGuestFavoritesDashboard =
    pathname === "/dashboard/favorites" ||
    pathname.startsWith("/dashboard/favorites/");
  if (
    pathname.startsWith("/dashboard") &&
    !isStaticAsset &&
    !hasLikelySupabaseSessionCookie(request) &&
    !isGuestFavoritesDashboard
  ) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("mode", "login");
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  if (pathname.startsWith("/api/") && !isStaticAsset) {
    Object.entries(noCacheHeaders).forEach(([k, v]) =>
      response.headers.set(k, v),
    );
  } else if (pathname.startsWith("/dashboard") && !isStaticAsset) {
    Object.entries(noCacheHeaders).forEach(([k, v]) =>
      response.headers.set(k, v),
    );
  } else if (pathname.startsWith("/admin") && !isStaticAsset) {
    Object.entries(noCacheHeaders).forEach(([k, v]) =>
      response.headers.set(k, v),
    );
  } else if (pathname === "/contact" && !isStaticAsset) {
    Object.entries(noCacheHeaders).forEach(([k, v]) =>
      response.headers.set(k, v),
    );
  } else if (isLocalhost && !isStaticAsset) {
    Object.entries(noCacheHeaders).forEach(([k, v]) =>
      response.headers.set(k, v),
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/contact",
    "/dashboard/:path*",
    "/auth",
    "/auth/:path*",
    "/api/:path*",
    "/admin",
    "/admin/(.*)",
  ],
};
