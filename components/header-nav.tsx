"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CompanySwitcher, { type CompanyOption } from "@/components/company-switcher";
import HeaderBoxDropdown from "@/components/header-box-dropdown";
import LogoutButton from "@/components/logout-button";

type OpenMenu = "ops" | "reports" | "cocoa" | "admin" | null;

type HeaderNavProps = {
  companies: CompanyOption[];
  activeCompanyId: string | null;
  isAdminForActiveCompany: boolean;
  activeRole: string | null;
  userLabel: string;
};

export default function HeaderNav({
  companies,
  activeCompanyId,
  isAdminForActiveCompany,
  activeRole,
  userLabel,
}: HeaderNavProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={navRef} className="flex flex-wrap items-center gap-3">
      <Link href="/" className="text-lg font-semibold text-zinc-900">
        Accounting Control
      </Link>

      <HeaderBoxDropdown
        label="Operations"
        open={openMenu === "ops"}
        onOpenChange={(next) => setOpenMenu(next ? "ops" : null)}
        items={[
          { href: "/staff/journals", label: "Journals" },
          { href: "/staff/ctro", label: "CTRO" },
          { href: "/staff/invoices", label: "Invoices" },
          { href: "/staff/receipts", label: "Receipts" },
          { href: "/staff/bills", label: "Bills" },
          { href: "/staff/payment-vouchers", label: "Payment Vouchers" },
        ]}
      />

      <HeaderBoxDropdown
        label="Reports"
        open={openMenu === "reports"}
        onOpenChange={(next) => setOpenMenu(next ? "reports" : null)}
        items={[
          { href: "/staff/trial-balance", label: "Trial Balance" },
          { href: "/staff/aging", label: "Aging" },
          { href: "/staff/customer-statements", label: "Customer Statements" },
          { href: "/staff/supplier-statements", label: "Supplier Statements" },
        ]}
      />

      {isAdminForActiveCompany && (
        <HeaderBoxDropdown
          label="Cocoa Admin"
          open={openMenu === "cocoa"}
          onOpenChange={(next) => setOpenMenu(next ? "cocoa" : null)}
          items={[
            { href: "/admin/cocoa/geo", label: "Cocoa Geo" },
            { href: "/admin/cocoa/rate-cards", label: "Cocoa Rate Cards" },
          ]}
        />
      )}

      <div className="min-w-[220px]">
        <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} />
      </div>

      {isAdminForActiveCompany && (
        <HeaderBoxDropdown
          label="Admin"
          align="right"
          open={openMenu === "admin"}
          onOpenChange={(next) => setOpenMenu(next ? "admin" : null)}
          items={[
            { href: "/admin/setup", label: "Setup" },
            { href: "/admin/companies", label: "Companies" },
            { href: "/admin/coa", label: "Chart of Accounts" },
            { href: "/admin/periods", label: "Periods" },
            { href: "/admin/customers", label: "Customers" },
            { href: "/admin/suppliers", label: "Suppliers" },
            { href: "/admin/tax", label: "Tax" },
            { href: "/admin/audit", label: "Audit" },
            { href: "/admin/users", label: "Users" },
          ]}
        />
      )}

      {userLabel && (
        <span className="text-sm text-zinc-500">{userLabel}</span>
      )}
      <LogoutButton />
    </div>
  );
}
