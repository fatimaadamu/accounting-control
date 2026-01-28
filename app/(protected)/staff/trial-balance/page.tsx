import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ensureActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { getTrialBalance } from "@/lib/data/trial-balance";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/trial-balance");

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);

  const { data: periods, error } = await supabaseAdmin()
    .from("periods")
    .select("id, period_month, period_year, start_date")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const periodList = periods ?? [];
  if (periodList.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance</CardTitle>
          <CardDescription>
            No periods for this company yet. Ask Admin to set up periods.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const defaultFrom = periodList[0]?.id ?? "";
  const defaultTo = periodList[periodList.length - 1]?.id ?? "";
  const fromId = searchParams.from ?? defaultFrom;
  const toId = searchParams.to ?? defaultTo;

  const fromIndex = periodList.findIndex((period) => period.id === fromId);
  const toIndex = periodList.findIndex((period) => period.id === toId);

  const sliceStart = Math.max(0, Math.min(fromIndex, toIndex));
  const sliceEnd = Math.max(0, Math.max(fromIndex, toIndex));
  const periodRange = periodList.slice(sliceStart, sliceEnd + 1);
  const periodIds = periodRange.map((period) => period.id);

  const rows = await getTrialBalance(companyId, periodIds);
  const totals = rows.reduce(
    (acc, row) => {
      acc.debit += row.debit;
      acc.credit += row.credit;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance</CardTitle>
          <CardDescription>Grouped by account code and name.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" method="get">
            <div className="space-y-2">
              <Label>From</Label>
              <Select name="from" defaultValue={fromId}>
                {periodList.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.period_year}-{String(period.period_month).padStart(2, "0")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Select name="to" defaultValue={toId}>
                {periodList.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.period_year}-{String(period.period_month).padStart(2, "0")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit">Refresh</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            {periodRange.length === 0
              ? "Select a period range."
              : `Periods: ${periodRange[0]?.period_year}-${String(
                  periodRange[0]?.period_month
                ).padStart(2, "0")} to ${periodRange[periodRange.length - 1]?.period_year}-${String(
                  periodRange[periodRange.length - 1]?.period_month
                ).padStart(2, "0")}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-zinc-500">
                    No balances for selected periods.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.account_id}>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right">
                      {row.debit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.credit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {rows.length > 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {totals.debit.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {totals.credit.toFixed(2)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
