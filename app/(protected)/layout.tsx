import Link from "next/link";

import CompanySwitcher from "@/components/company-switcher";
import LogoutButton from "@/components/logout-button";
import { getActiveCompanyId, getUserCompanies, getUserCompanyRoles, requireUser } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const companies = await getUserCompanies(user.id);
  const activeCompanyId = await getActiveCompanyId();
  const roles = await getUserCompanyRoles(user.id);
  const resolvedCompanyId = companies.some(
    (company) => company.id === activeCompanyId
  )
    ? activeCompanyId
    : null;
  const isAdminForActiveCompany = roles.some(
    (role) => role.company_id === resolvedCompanyId && role.role === "Admin"
  );

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
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden min-w-[220px] md:block">
              <CompanySwitcher
                companies={companies.map((company) => ({
                  id: company.id,
                  name: company.name,
                }))}
                activeCompanyId={resolvedCompanyId}
              />
            </div>
            <span className="hidden text-sm text-zinc-500 md:block">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-4 md:hidden">
          <CompanySwitcher
            companies={companies.map((company) => ({
              id: company.id,
              name: company.name,
            }))}
            activeCompanyId={resolvedCompanyId}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
