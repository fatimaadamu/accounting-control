"use client";

import * as React from "react";

import { Select } from "@/components/ui/select";

export type CompanyOption = {
  id: string;
  name: string;
};

type CompanySwitcherProps = {
  companies: CompanyOption[];
  activeCompanyId: string | null;
};

const setCompanyCookie = (companyId: string) => {
  document.cookie = `company_id=${companyId}; path=/; samesite=lax`;
};

export default function CompanySwitcher({
  companies,
  activeCompanyId,
}: CompanySwitcherProps) {
  React.useEffect(() => {
    if (!activeCompanyId) {
      const stored = window.localStorage.getItem("company_id");
      if (stored) {
        setCompanyCookie(stored);
        window.location.reload();
      }
    }
  }, [activeCompanyId]);

  if (companies.length === 0) {
    return null;
  }

  return (
    <Select
      value={activeCompanyId ?? ""}
      onChange={(event) => {
        const companyId = event.target.value;
        window.localStorage.setItem("company_id", companyId);
        setCompanyCookie(companyId);
        window.location.reload();
      }}
    >
      {!activeCompanyId && <option value="">Select company</option>}
      {companies.map((company) => (
        <option key={company.id} value={company.id}>
          {company.name}
        </option>
      ))}
    </Select>
  );
}