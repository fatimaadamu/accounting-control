import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { closePeriod, reopenPeriod } from "@/lib/actions/periods";
import { getActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function PeriodsPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Periods</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);

  const { data: periods, error } = await supabaseAdmin()
    .from("periods")
    .select(
      "id, period_month, period_year, start_date, end_date, status, closed_at, reopened_at"
    )
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  async function closeAction(formData: FormData) {
    "use server";
    const periodId = String(formData.get("period_id") ?? "");
    await closePeriod(periodId);
    revalidatePath("/admin/periods");
  }

  async function reopenAction(formData: FormData) {
    "use server";
    const periodId = String(formData.get("period_id") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      throw new Error("Reopen reason is required.");
    }
    await reopenPeriod(periodId, reason);
    revalidatePath("/admin/periods");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Periods</CardTitle>
        <CardDescription>Close or reopen periods as needed.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(periods ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-zinc-500">
                  No periods found.
                </TableCell>
              </TableRow>
            ) : (
              periods?.map((period) => (
                <TableRow key={period.id}>
                  <TableCell>
                    {period.period_year}-{String(period.period_month).padStart(2, "0")}
                  </TableCell>
                  <TableCell>
                    {period.start_date} to {period.end_date}
                  </TableCell>
                  <TableCell className="capitalize">{period.status}</TableCell>
                  <TableCell className="space-y-2">
                    {period.status === "open" ? (
                      <form action={closeAction}>
                        <input type="hidden" name="period_id" value={period.id} />
                        <Button type="submit" variant="outline">
                          Close period
                        </Button>
                      </form>
                    ) : (
                      <form action={reopenAction} className="flex flex-col gap-2">
                        <input type="hidden" name="period_id" value={period.id} />
                        <Input name="reason" placeholder="Reopen reason" />
                        <Button type="submit" variant="outline">
                          Reopen period
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
