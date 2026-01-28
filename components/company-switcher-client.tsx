"use client";

import { usePathname } from "next/navigation";

import { Select } from "@/components/ui/select";
import type { CompanyOption } from "@/components/company-switcher";

type CompanySwitcherClientProps = {
  companies: CompanyOption[];
  activeCompanyId: string | null;
};

export default function CompanySwitcherClient({
  companies,
  activeCompanyId,
}: CompanySwitcherClientProps) {
  const pathname = usePathname();
  const resolvedCompanyId =
    activeCompanyId && companies.some((company) => company.id === activeCompanyId)
      ? activeCompanyId
      : companies[0]?.id ?? "";

  const nextPath = pathname || "/";

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600">
      <span className="font-medium text-zinc-700">Company:</span>
      <Select
        value={resolvedCompanyId}
        onChange={(event) => {
          const companyId = event.target.value;
          const target = `/api/company/default?company_id=${companyId}&next=${encodeURIComponent(
            nextPath
          )}`;
          window.location.href = target;
        }}
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
