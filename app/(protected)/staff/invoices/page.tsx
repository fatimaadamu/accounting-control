import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import DocumentLinesForm from "@/components/document-lines-form";
import ReconciliationBanner from "@/components/reconciliation-banner";
import ToastMessage from "@/components/toast-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createInvoiceDraft,
  deleteInvoiceDraft,
  getArReconciliation,
  postInvoice,
  submitInvoice,
} from "@/lib/actions/arap";
import { ensureActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { canAnyRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; toast?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/invoices");

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);
  const activeCompanyId = companyId as string;

  const roles = await getUserCompanyRoles(user.id);
  const companyRoles = roles
    .filter((role) => role.company_id === companyId)
    .map((role) => role.role);
  const canCreate = canAnyRole(companyRoles, null, "CREATE").allowed;
  const canSubmitDraft = canAnyRole(companyRoles, "draft", "SUBMIT").allowed;
  const canPostSubmitted = canAnyRole(companyRoles, "submitted", "POST").allowed;
  const canDeleteDraft = canAnyRole(companyRoles, "draft", "DELETE_DRAFT").allowed;
  const isAdmin = companyRoles.includes("Admin");

  const { data: customers, error: customerError } = await supabaseAdmin()
    .from("customers")
    .select("id, name, tax_exempt")
    .eq("company_id", companyId)
    .order("name");

  if (customerError) {
    throw new Error(customerError.message);
  }

  const { data: periods, error: periodError } = await supabaseAdmin()
    .from("periods")
    .select("id, period_month, period_year")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });

  if (periodError) {
    throw new Error(periodError.message);
  }

  const supabase = await createSupabaseServerClient();
  let accounts: Array<{ id: string; code: string; name: string }> = [];
  const { data: incomeHeader, error: incomeHeaderError } = await supabase
    .from("account_headers")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", "Income")
    .maybeSingle();

  if (!incomeHeaderError && incomeHeader?.id) {
    const { data: groups, error: groupsError } = await supabase
      .from("account_groups")
      .select("id")
      .eq("company_id", companyId)
      .eq("header_id", incomeHeader.id);

    if (!groupsError && groups && groups.length > 0) {
      const groupIds = groups.map((group) => group.id);
      const { data: categories, error: categoriesError } = await supabase
        .from("account_categories")
        .select("id")
        .eq("company_id", companyId)
        .in("group_id", groupIds);

      if (!categoriesError && categories && categories.length > 0) {
        const categoryIds = categories.map((category) => category.id);
        const { data: accountRows, error: accountError } = await supabase
          .from("accounts")
          .select("id, code, name")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .in("category_id", categoryIds)
          .order("code");

        if (accountError) {
          throw new Error(accountError.message);
        }

        accounts = accountRows ?? [];
      }
    }
  }

  if (accounts.length === 0) {
    const { data: fallbackAccounts, error: fallbackError } = await supabaseAdmin()
      .from("accounts")
      .select(
        "id, code, name, is_active, account_categories!inner(account_groups!inner(account_headers!inner(name)))"
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .eq("account_categories.account_groups.account_headers.name", "Income")
      .order("code");

    if (!fallbackError && fallbackAccounts) {
      accounts = fallbackAccounts.map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
      }));
    }
  }

  const { data: invoices, error: invoiceError } = await supabaseAdmin()
    .from("invoices")
    .select("id, invoice_no, invoice_date, due_date, status, total_gross, created_by, customers ( name )")
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false })
    .limit(50);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const reconciliation = await getArReconciliation(activeCompanyId);

  async function createAction(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customer_id") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const invoiceNo = String(formData.get("invoice_no") ?? "").trim();
    const invoiceDate = String(formData.get("invoice_date") ?? "");
    const dueDateRaw = String(formData.get("due_date") ?? "");
    const narration = String(formData.get("narration") ?? "").trim();
    const linesJson = String(formData.get("lines_json") ?? "[]");
    const lines = JSON.parse(linesJson) as Array<{
      account_id: string;
      description: string;
      quantity: string;
      unit_price: string;
    }>;

    if (!invoiceNo) {
      throw new Error("Invoice number is required.");
    }

    const filteredLines = lines
      .map((line) => ({
        account_id: line.account_id,
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
      }))
      .filter((line) => line.account_id && line.quantity > 0);

    if (filteredLines.length === 0) {
      redirect(
        "/staff/invoices?error=lines&toast=error&message=Add%20at%20least%20one%20invoice%20line%20with%20an%20income%20account%20and%20amount."
      );
    }

    try {
      await createInvoiceDraft({
        company_id: activeCompanyId,
        customer_id: customerId,
        period_id: periodId,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        due_date: dueDateRaw || null,
        narration,
        lines: filteredLines,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save invoice.";
      redirect(`/staff/invoices?toast=error&message=${encodeURIComponent(message)}`);
    }

    revalidatePath("/staff/invoices");
    redirect("/staff/invoices?toast=saved");
  }

  async function submitAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    try {
      await submitInvoice(invoiceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit invoice.";
      redirect(`/staff/invoices?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/invoices");
    redirect("/staff/invoices?toast=submitted");
  }

  async function postAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    try {
      await postInvoice(invoiceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to post invoice.";
      redirect(`/staff/invoices?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/invoices");
    redirect("/staff/invoices?toast=posted");
  }

  async function submitAndPostAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    try {
      await submitInvoice(invoiceId);
      await postInvoice(invoiceId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit and post invoice.";
      redirect(`/staff/invoices?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/invoices");
    redirect("/staff/invoices?toast=posted");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const invoiceId = String(formData.get("invoice_id") ?? "");
    try {
      await deleteInvoiceDraft(invoiceId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete invoice.";
      redirect(`/staff/invoices?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/invoices");
    redirect("/staff/invoices?toast=deleted");
  }

  if ((periods ?? []).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            No periods for this company yet. Ask Admin to set up periods.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={
            resolvedSearchParams.toast === "saved"
              ? "Invoice saved"
              : resolvedSearchParams.toast === "submitted"
              ? "Invoice submitted"
              : resolvedSearchParams.toast === "posted"
              ? "Invoice posted"
              : resolvedSearchParams.toast === "deleted"
              ? "Invoice deleted"
              : resolvedSearchParams.message ?? "Action completed"
          }
        />
      )}

      <ReconciliationBanner
        title="AR reconciliation"
        description="Control vs customer balances."
        controlBalance={reconciliation.arControlBalance}
        subledgerBalance={reconciliation.totalCustomerBalance}
        difference={reconciliation.difference}
        detailsHref="/staff/reconciliation?type=ar"
      />

      <Card>
        <CardHeader>
          <CardTitle>New invoice</CardTitle>
          <CardDescription>Create an invoice draft.</CardDescription>
        </CardHeader>
        <CardContent>
          {resolvedSearchParams?.error === "lines" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Add at least one invoice line with an income account and amount.
            </div>
          )}
          {!canCreate ? (
            <p className="text-sm text-zinc-600">
              You do not have permission to create invoices.
            </p>
          ) : (
            <form action={createAction} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select name="customer_id" required>
                    <option value="">Select customer</option>
                    {(customers ?? []).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} {customer.tax_exempt ? "(Tax exempt)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select name="period_id" required>
                    <option value="">Select period</option>
                    {(periods ?? []).map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.period_year}-{String(period.period_month).padStart(2, "0")}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Invoice no</Label>
                  <Input name="invoice_no" required />
                </div>
                <div className="space-y-2">
                  <Label>Invoice date</Label>
                  <Input name="invoice_date" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input name="due_date" type="date" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Narration</Label>
                  <Input name="narration" />
                </div>
              </div>

              {accounts && accounts.length === 0 && (
                <p className="text-sm text-zinc-600">
                  No income accounts yet. Ask Admin to add Sales Income.
                </p>
              )}
              <DocumentLinesForm accounts={accounts ?? []} />
              <Button type="submit" disabled={!!accounts && accounts.length === 0}>
                Save draft
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
          <CardDescription>Latest 50 invoices for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-zinc-500">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                invoices?.map((invoice) => {
                  const customer = Array.isArray(invoice.customers)
                    ? invoice.customers[0]
                    : invoice.customers;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>{invoice.invoice_date}</TableCell>
                      <TableCell>{invoice.invoice_no}</TableCell>
                      <TableCell>{(customer as { name: string } | null)?.name ?? "-"}</TableCell>
                      <TableCell>{Number(invoice.total_gross).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invoice.status === "posted"
                              ? "success"
                              : invoice.status === "approved"
                              ? "warning"
                              : invoice.status === "submitted"
                              ? "default"
                              : "default"
                          }
                        >
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-y-2">
                        <Link
                          href={`/staff/invoices/${invoice.id}`}
                          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          View
                        </Link>
                        {invoice.status === "draft" && canSubmitDraft && (
                          <form action={submitAction}>
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {invoice.status === "draft" && isAdmin && canSubmitDraft && canPostSubmitted && (
                          <form action={submitAndPostAction}>
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <Button type="submit" variant="default">
                              Submit &amp; Post
                            </Button>
                          </form>
                        )}
                        {invoice.status === "submitted" && canPostSubmitted && (
                          <form action={postAction}>
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <Button type="submit" variant="outline">
                              Post
                            </Button>
                          </form>
                        )}
                        {invoice.status === "draft" && canDeleteDraft && (
                          <form action={deleteAction}>
                            <input type="hidden" name="invoice_id" value={invoice.id} />
                            <Button type="submit" variant="ghost">
                              Delete
                            </Button>
                          </form>
                        )}
                      </TableCell>
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
