import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const activeCompanyId = req.cookies.get("activeCompanyId")?.value ?? null;
  if (!activeCompanyId) {
    return NextResponse.json({ activeCompanyId: null });
  }

  const { data: company } = await supabaseAdmin()
    .from("companies")
    .select("id")
    .eq("id", activeCompanyId)
    .maybeSingle();

  return NextResponse.json({ activeCompanyId: company ? activeCompanyId : null });
}

export async function POST(req: NextRequest) {
  const { companyId } = await req.json().catch(() => ({ companyId: null }));

  if (!companyId || typeof companyId !== "string") {
    return NextResponse.json({ ok: false, error: "companyId required" }, { status: 400 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  const { data: company } = await supabaseAdmin()
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ ok: false, error: "Company not found." }, { status: 404 });
  }

  const { data: role } = await supabaseAdmin()
    .from("user_company_roles")
    .select("company_id")
    .eq("user_id", userData.user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!role) {
    return NextResponse.json(
      { ok: false, error: "No access to this company." },
      { status: 403 }
    );
  }

  const res = NextResponse.json({ ok: true, activeCompanyId: companyId });

  res.cookies.set({
    name: "activeCompanyId",
    value: companyId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
