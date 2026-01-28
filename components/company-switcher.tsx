import CompanySwitcherClient from "@/components/company-switcher-client";

export type CompanyOption = {
  id: string;
  name: string;
};

type CompanySwitcherProps = {
  companies: CompanyOption[];
  activeCompanyId: string | null;
};

export default function CompanySwitcher({
  companies,
  activeCompanyId,
}: CompanySwitcherProps) {
  if (companies.length === 0) {
    return (
      <div className="text-sm text-zinc-600">
        No company access yet. Please contact Admin.
      </div>
    );
  }

  return (
    <CompanySwitcherClient
      companies={companies}
      activeCompanyId={activeCompanyId}
    />
  );
}
