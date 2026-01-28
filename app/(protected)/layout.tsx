import Link from "next/link";
import { headers } from "next/headers";

import CompanySwitcher from "@/components/company-switcher";
import LogoutButton from "@/components/logout-button";
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
  const nextUrl = headerList.get("next-url") ?? headerList.get("x-next-url") ?? headerList.get("x-url");
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
    companies.reduce<Map<string, (typeof companies)[number]>>((map, company) => {
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
  const activeCompany = activeCompanyId
    ? uniqueCompanies.find((company) => company.id === activeCompanyId)
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold text-zinc-900">
              Accounting Control
            </Link>
            <nav className="flex items-center gap-2 text-sm text-zinc-600">
              {isAdminForActiveCompany && (
                <>
                  <Link
                    href="/admin/setup"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Setup
                  </Link>
                  <Link
                    href="/admin/companies"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Companies
                  </Link>
                  <Link
                    href="/admin/coa"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Chart of Accounts
                  </Link>
                  <Link
                    href="/admin/periods"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Periods
                  </Link>
                  <Link
                    href="/admin/customers"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Customers
                  </Link>
                  <Link
                    href="/admin/suppliers"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Suppliers
                  </Link>
                  <Link
                    href="/admin/customer-groups"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Customer Groups
                  </Link>
                  <Link
                    href="/admin/supplier-groups"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Supplier Groups
                  </Link>
                  <Link
                    href="/admin/tax"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Tax
                  </Link>
                  <Link
                    href="/admin/audit"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Audit
                  </Link>
                  <Link
                    href="/admin/cocoa-agents"
                    className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Cocoa Agents
                  </Link>
                </>
              )}
              <Link
                href="/staff/journals"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Journals
              </Link>
              <Link
                href="/staff/invoices"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Invoices
              </Link>
              <Link
                href="/staff/receipts"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Receipts
              </Link>
              <Link
                href="/staff/bills"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Bills
              </Link>
              <Link
                href="/staff/payment-vouchers"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Payment Vouchers
              </Link>
              <Link
                href="/staff/customer-statements"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Customer Statements
              </Link>
              <Link
                href="/staff/supplier-statements"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Supplier Statements
              </Link>
              <Link
                href="/staff/aging"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Aging
              </Link>
              <Link
                href="/staff/trial-balance"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Trial Balance
              </Link>
              <Link
                href="/staff/ctro"
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                CTRO
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden min-w-[220px] md:block">
              <CompanySwitcher companies={uniqueCompanies} activeCompanyId={activeCompanyId} />
            </div>
            {activeRole && (
              <span className="hidden rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 md:inline-flex">
                {activeRole}
                {activeCompany?.name ? ` • ${activeCompany.name}` : ""}
              </span>
            )}
            <span className="hidden text-sm text-zinc-500 md:block">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-4 md:hidden">
          <CompanySwitcher companies={uniqueCompanies} activeCompanyId={activeCompanyId} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
