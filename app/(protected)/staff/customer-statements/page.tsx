import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { getCustomerStatement } from "@/lib/data/arap";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function CustomerStatementsPage({
  searchParams,
}: {
  searchParams: { customer?: string; mode?: string };
}) {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer statements</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyAccess(user.id, companyId);
  const activeCompanyId = companyId as string;

  const { data: customers, error } = await supabaseAdmin()
    .from("customers")
    .select("id, name")
    .eq("company_id", activeCompanyId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const selectedId = searchParams.customer ?? "";
  const mode = searchParams.mode ?? "short";

  const entries = selectedId ? await getCustomerStatement(activeCompanyId, selectedId) : [];
  const balance = entries.length ? entries[entries.length - 1].balance : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer statements</CardTitle>
          <CardDescription>Short or full customer balances.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" method="get">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select name="customer" defaultValue={selectedId}>
                <option value="">Select customer</option>
                {(customers ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select name="mode" defaultValue={mode}>
                <option value="short">Short</option>
                <option value="full">Full</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit">View</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle>Statement</CardTitle>
            <CardDescription>Balance: {balance.toFixed(2)}</CardDescription>
          </CardHeader>
          <CardContent>
            {mode === "short" ? (
              <p className="text-sm text-zinc-600">
                Customer balance as at today: {balance.toFixed(2)}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Debit</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-zinc-500">
                        No transactions.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry, index) => (
                      <TableRow key={`${entry.date}-${index}`}>
                        <TableCell>{entry.date}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell>{entry.debit.toFixed(2)}</TableCell>
                        <TableCell>{entry.credit.toFixed(2)}</TableCell>
                        <TableCell>{entry.balance.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
