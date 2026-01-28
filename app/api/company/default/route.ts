import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const companyId = searchParams.get("company_id");
  const next = searchParams.get("next") ?? "/";

  const response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  if (!companyId) {
    return NextResponse.redirect(new URL("/admin/companies", origin));
  }

  const { data: role, error } = await supabaseAdmin()
    .from("user_company_roles")
    .select("company_id")
    .eq("user_id", data.user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !role) {
    return NextResponse.redirect(new URL("/admin/companies", origin));
  }

  response.cookies.set({
    name: "activeCompanyId",
    value: companyId,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
