import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function InvoiceDetailPage({
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
          <CardTitle>Invoice</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyAccess(user.id, companyId);

  const { data: invoice, error } = await supabaseAdmin()
    .from("ar_invoices")
    .select(
      "id, invoice_date, due_date, narration, status, total_net, total_tax, total_gross, customers ( name )"
    )
    .eq("id", params.id)
    .eq("company_id", companyId)
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Invoice not found.");
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("ar_invoice_lines")
    .select("id, description, quantity, unit_price, line_total, accounts ( code, name )")
    .eq("invoice_id", invoice.id);

  if (lineError) {
    throw new Error(lineError.message);
  }

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
          <CardTitle>Invoice details</CardTitle>
          <CardDescription>
            {(() => {
              const customer = Array.isArray(invoice.customers)
                ? invoice.customers[0]
                : invoice.customers;
              return (customer as { name: string } | null)?.name ?? "";
            })()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          <p>Date: {invoice.invoice_date}</p>
          <p>Due: {invoice.due_date}</p>
          <p>Status: {invoice.status}</p>
          <p>Total: {Number(invoice.total_gross).toFixed(2)}</p>
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
                <TableHead>Qty</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lines ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No lines.
                  </TableCell>
                </TableRow>
              ) : (
                lines?.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      {(() => {
                        const account = Array.isArray(line.accounts)
                          ? line.accounts[0]
                          : line.accounts;
                        return account
                          ? `${(account as { code: string; name: string }).code} - ${(account as { code: string; name: string }).name}`
                          : "-";
                      })()}
                    </TableCell>
                    <TableCell>{line.description ?? "-"}</TableCell>
                    <TableCell>{Number(line.quantity).toFixed(2)}</TableCell>
                    <TableCell>{Number(line.unit_price).toFixed(2)}</TableCell>
                    <TableCell>{Number(line.line_total).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">
                  Total
                </TableCell>
                <TableCell className="font-semibold">
                  {Number(invoice.total_gross).toFixed(2)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
