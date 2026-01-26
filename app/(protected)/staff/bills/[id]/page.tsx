import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function BillDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bill</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyAccess(user.id, companyId);

  const { data: bill, error } = await supabaseAdmin()
    .from("bills")
    .select(
      "id, bill_no, bill_date, due_date, narration, status, total_net, total_tax, total_gross, suppliers ( name )"
    )
    .eq("id", params.id)
    .eq("company_id", companyId)
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Bill not found.");
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("bill_lines")
    .select("id, description, net_amount, accounts ( code, name )")
    .eq("bill_id", bill.id);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const supplier = Array.isArray(bill.suppliers) ? bill.suppliers[0] : bill.suppliers;

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
          <CardTitle>Bill {bill.bill_no}</CardTitle>
          <CardDescription>{(supplier as { name: string } | null)?.name ?? ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          <p>Date: {bill.bill_date}</p>
          <p>Due: {bill.due_date ?? "-"}</p>
          <p>Status: {bill.status}</p>
          <p>Net: {Number(bill.total_net).toFixed(2)}</p>
          <p>Tax: {Number(bill.total_tax).toFixed(2)}</p>
          <p>Total: {Number(bill.total_gross).toFixed(2)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lines ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-zinc-500">
                    No lines.
                  </TableCell>
                </TableRow>
              ) : (
                lines?.map((line) => {
                  const account = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        {account
                          ? `${(account as { code: string; name: string }).code} - ${(account as {
                              code: string;
                              name: string;
                            }).name}`
                          : "-"}
                      </TableCell>
                      <TableCell>{line.description ?? "-"}</TableCell>
                      <TableCell>{Number(line.net_amount).toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })
              )}
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">
                  Total
                </TableCell>
                <TableCell className="font-semibold">
                  {Number(bill.total_gross).toFixed(2)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
