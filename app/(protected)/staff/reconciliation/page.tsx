import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApReconciliation, getArReconciliation } from "@/lib/actions/arap";
import { getActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyAccess(user.id, companyId);

  const type = searchParams.type === "ap" ? "ap" : "ar";

  if (type === "ar") {
    const reconciliation = await getArReconciliation(companyId);
    const balances = Array.from(reconciliation.customerBalances.entries())
      .map(([id, balance]) => ({ id, balance }))
      .filter((item) => Math.abs(item.balance) > 0.01)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 10);

    const { data: customers, error } = await supabaseAdmin()
      .from("customers")
      .select("id, name")
      .in(
        "id",
        balances.length > 0 ? balances.map((item) => item.id) : ["00000000-0000-0000-0000-000000000000"]
      );

    if (error) {
      throw new Error(error.message);
    }

    const nameMap = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));

    return (
      <div className="space-y-6">
        <Link
          href="/staff/invoices"
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          Back to invoices
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>AR reconciliation</CardTitle>
            <CardDescription>Control vs customer balances.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            <p>Control: {reconciliation.arControlBalance.toFixed(2)}</p>
            <p>Subledger: {reconciliation.totalCustomerBalance.toFixed(2)}</p>
            <p>Difference: {reconciliation.difference.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top customer balances</CardTitle>
            <CardDescription>Largest open customer balances.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-zinc-500">
                      No outstanding balances.
                    </TableCell>
                  </TableRow>
                ) : (
                  balances.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{nameMap.get(item.id) ?? "Customer"}</TableCell>
                      <TableCell>{item.balance.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  const reconciliation = await getApReconciliation(companyId);
  const balances = Array.from(reconciliation.supplierBalances.entries())
    .map(([id, balance]) => ({ id, balance }))
    .filter((item) => Math.abs(item.balance) > 0.01)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, 10);

  const { data: suppliers, error } = await supabaseAdmin()
    .from("suppliers")
    .select("id, name")
    .in(
      "id",
      balances.length > 0 ? balances.map((item) => item.id) : ["00000000-0000-0000-0000-000000000000"]
    );

  if (error) {
    throw new Error(error.message);
  }

  const nameMap = new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.name]));

  return (
    <div className="space-y-6">
      <Link
        href="/staff/bills"
        className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Back to bills
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>AP reconciliation</CardTitle>
          <CardDescription>Control vs supplier balances.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          <p>Control: {reconciliation.apControlBalance.toFixed(2)}</p>
          <p>Subledger: {reconciliation.totalSupplierBalance.toFixed(2)}</p>
          <p>Difference: {reconciliation.difference.toFixed(2)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top supplier balances</CardTitle>
          <CardDescription>Largest open supplier balances.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-sm text-zinc-500">
                    No outstanding balances.
                  </TableCell>
                </TableRow>
              ) : (
                balances.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{nameMap.get(item.id) ?? "Supplier"}</TableCell>
                    <TableCell>{item.balance.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
