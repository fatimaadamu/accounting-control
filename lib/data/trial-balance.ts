import { supabaseAdmin } from "@/lib/supabase/admin";

export type TrialBalanceRow = {
  account_id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
};

export const getTrialBalance = async (
  companyId: string,
  periodIds: string[]
) => {
  if (periodIds.length === 0) {
    return [] as TrialBalanceRow[];
  }

  const { data, error } = await supabaseAdmin()
    .from("journal_lines")
    .select(
      "debit, credit, account_id, accounts ( code, name ), journal_entries!inner(period_id, status, company_id)"
    )
    .eq("journal_entries.company_id", companyId)
    .eq("journal_entries.status", "posted")
    .in("journal_entries.period_id", periodIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = new Map<string, TrialBalanceRow>();
  for (const line of data ?? []) {
    const accountValue = line.accounts as
      | { code: string; name: string }
      | { code: string; name: string }[]
      | null;
    const account = Array.isArray(accountValue) ? accountValue[0] : accountValue;
    if (!account) {
      continue;
    }
    const current = rows.get(line.account_id) ?? {
      account_id: line.account_id,
      code: account.code,
      name: account.name,
      debit: 0,
      credit: 0,
    };
    current.debit += Number(line.debit) || 0;
    current.credit += Number(line.credit) || 0;
    rows.set(line.account_id, current);
  }

  return Array.from(rows.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );
};
