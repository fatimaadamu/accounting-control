import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  const res = next
    ? NextResponse.redirect(new URL(next, request.url))
    : NextResponse.json({ ok: true });

  res.cookies.set({ name: "activeCompanyId", value: "", path: "/", maxAge: 0 });

  const cookieNames = [
    "sb-access-token",
    "sb-refresh-token",
    "supabase-auth-token",
    "sb-auth-token",
  ];

  for (const name of cookieNames) {
    res.cookies.set({ name, value: "", path: "/", maxAge: 0 });
  }

  return res;
}
