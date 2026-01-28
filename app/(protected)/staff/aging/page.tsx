import ReconciliationBanner from "@/components/reconciliation-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApReconciliation, getArReconciliation } from "@/lib/actions/arap";
import { ensureActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { getAgingBuckets } from "@/lib/data/arap";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function AgingPage() {
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/aging");

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);
  const activeCompanyId = companyId as string;

  const [customerBuckets, supplierBuckets, arReconciliation, apReconciliation] =
    await Promise.all([
      getAgingBuckets(activeCompanyId, "customers"),
      getAgingBuckets(activeCompanyId, "suppliers"),
      getArReconciliation(activeCompanyId),
      getApReconciliation(activeCompanyId),
    ]);

  const { data: customers, error: customerError } = await supabaseAdmin()
    .from("customers")
    .select("id, name")
    .eq("company_id", activeCompanyId)
    .order("name");

  if (customerError) {
    throw new Error(customerError.message);
  }

  const { data: suppliers, error: supplierError } = await supabaseAdmin()
    .from("suppliers")
    .select("id, name")
    .eq("company_id", activeCompanyId)
    .order("name");

  if (supplierError) {
    throw new Error(supplierError.message);
  }

  return (
    <div className="space-y-6">
      <ReconciliationBanner
        title="AR reconciliation"
        description="Control vs customer balances."
        controlBalance={arReconciliation.arControlBalance}
        subledgerBalance={arReconciliation.totalCustomerBalance}
        difference={arReconciliation.difference}
        detailsHref="/staff/reconciliation?type=ar"
      />
      <ReconciliationBanner
        title="AP reconciliation"
        description="Control vs supplier balances."
        controlBalance={apReconciliation.apControlBalance}
        subledgerBalance={apReconciliation.totalSupplierBalance}
        difference={apReconciliation.difference}
        detailsHref="/staff/reconciliation?type=ap"
      />
      <Card>
        <CardHeader>
          <CardTitle>Debtors aging</CardTitle>
          <CardDescription>Outstanding customer balances by due date.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>1-30</TableHead>
                <TableHead>31-60</TableHead>
                <TableHead>61-90</TableHead>
                <TableHead>90+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(customers ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-zinc-500">
                    No customers.
                  </TableCell>
                </TableRow>
              ) : (
                customers?.map((customer) => {
                  const bucket = customerBuckets[customer.id] ?? {
                    current: 0,
                    days30: 0,
                    days60: 0,
                    days90: 0,
                    days90plus: 0,
                  };
                  return (
                    <TableRow key={customer.id}>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell>{bucket.current.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days30.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days60.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days90.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days90plus.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Creditors aging</CardTitle>
          <CardDescription>Outstanding supplier balances by due date.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>1-30</TableHead>
                <TableHead>31-60</TableHead>
                <TableHead>61-90</TableHead>
                <TableHead>90+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(suppliers ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-zinc-500">
                    No suppliers.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers?.map((supplier) => {
                  const bucket = supplierBuckets[supplier.id] ?? {
                    current: 0,
                    days30: 0,
                    days60: 0,
                    days90: 0,
                    days90plus: 0,
                  };
                  return (
                    <TableRow key={supplier.id}>
                      <TableCell>{supplier.name}</TableCell>
                      <TableCell>{bucket.current.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days30.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days60.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days90.toFixed(2)}</TableCell>
                      <TableCell>{bucket.days90plus.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
