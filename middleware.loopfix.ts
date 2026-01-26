import { NextResponse, type NextRequest } from "next/server";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
}

function isProtectedPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/staff");
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Never guard public paths
  if (isPublicPath(pathname)) return NextResponse.next();

  // Only guard /admin and /staff
  if (!isProtectedPath(pathname)) return NextResponse.next();

  // Read-only cookie check. DO NOT set cookies in middleware.
  const hasSessionCookie =
    req.cookies.get("sb-access-token") ||
    req.cookies.get("sb-refresh-token") ||
    req.cookies.get("supabase-auth-token");

  if (!hasSessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("returnTo", pathname + (search || ""));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Limit middleware execution
export const config = {
  matcher: ["/admin/:path*", "/staff/:path*"],
};