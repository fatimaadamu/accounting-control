import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set() {
          // Read-only in route handler response is enough for this endpoint.
        },
        remove() {
          // Read-only.
        },
      },
    }
  );

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ userId: null, companies: [], roles: [] });
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_company_roles")
    .select("company_id, role")
    .eq("user_id", userId);

  if (roleError) {
    return NextResponse.json({ userId, companies: [], roles: [] }, { status: 200 });
  }

  const companyIds = Array.from(new Set((roles ?? []).map((row) => row.company_id)));
  if (companyIds.length === 0) {
    return NextResponse.json({ userId, companies: [], roles: roles ?? [] });
  }

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .in("id", companyIds);

  if (companyError) {
    return NextResponse.json({ userId, companies: [], roles: roles ?? [] }, { status: 200 });
  }

  return NextResponse.json({
    userId,
    companies: companies ?? [],
    roles: roles ?? [],
  });
}
