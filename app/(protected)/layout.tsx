import { headers } from "next/headers";

import HeaderNav from "@/components/header-nav";
import {
  ensureActiveCompanyId,
  getUserCompanies,
  getUserCompanyRoles,
  requireUser,
} from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const headerList = await headers();
  const explicitPath =
    headerList.get("x-pathname") ??
    headerList.get("x-nextjs-matched-path") ??
    null;
  const nextUrl =
    headerList.get("next-url") ??
    headerList.get("x-next-url") ??
    headerList.get("x-url");
  let currentPath = explicitPath;
  if (!currentPath && nextUrl) {
    if (nextUrl.startsWith("/")) {
      currentPath = nextUrl;
    } else {
      try {
        const parsed = new URL(nextUrl, "http://localhost");
        currentPath = `${parsed.pathname}${parsed.search}`;
      } catch {
        currentPath = null;
      }
    }
  }
  if (!currentPath) {
    currentPath = "/staff/journals";
  }
  const activeCompanyId = await ensureActiveCompanyId(user.id, currentPath);
  const companies = await getUserCompanies(user.id);
  const uniqueCompanies = Array.from(
    companies
      .reduce<Map<string, (typeof companies)[number]>>((map, company) => {
        const key = company.id || company.name;
        if (!map.has(key)) {
          map.set(key, company);
        }
        return map;
      }, new Map())
  )
    .map((entry) => entry[1])
    .sort((a, b) => a.name.localeCompare(b.name));
  const roles = await getUserCompanyRoles(user.id);
  const isAdminForActiveCompany = activeCompanyId
    ? roles.some((role) => role.company_id === activeCompanyId && role.role === "Admin")
    : false;
  const activeRole = activeCompanyId
    ? roles.find((role) => role.company_id === activeCompanyId)?.role ?? null
    : null;
  const userLabel = user.user_metadata?.display_name ?? user.email ?? "";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <HeaderNav
            companies={uniqueCompanies}
            activeCompanyId={activeCompanyId}
            isAdminForActiveCompany={isAdminForActiveCompany}
            activeRole={activeRole}
            userLabel={userLabel}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
