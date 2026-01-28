import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const activeCompanyId = req.cookies.get("activeCompanyId")?.value ?? null;
  return NextResponse.json({ activeCompanyId });
}

export async function POST(req: NextRequest) {
  const { companyId } = await req.json().catch(() => ({ companyId: null }));

  if (!companyId || typeof companyId !== "string") {
    return NextResponse.json({ ok: false, error: "companyId required" }, { status: 400 });
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