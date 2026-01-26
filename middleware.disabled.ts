import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/admin", "/staff"];
const PUBLIC_PREFIXES = ["/login", "/api", "/_next", "/favicon.ico"];
const PUBLIC_FILES = ["/robots.txt", "/sitemap.xml"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPrefix = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isPublicFile = PUBLIC_FILES.some((file) => pathname === file);
  const isStaticAsset = pathname.includes(".") && !pathname.endsWith(".json");

  if (isPublicPrefix || isPublicFile || isStaticAsset) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set() {
          // Read-only in middleware; refresh handled by route handler.
        },
        remove() {
          // Read-only in middleware; refresh handled by route handler.
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/staff/:path*"],
};
