
"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyAccess, requireCompanyRole, requireUser } from "@/lib/auth";
import { createPostedJournalFromLines } from "@/lib/actions/journals";

type AuditPayload = {
  company_id: string;
  entity: string;
  entity_id: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  created_by: string;
};

type DocumentLineInput = {
  account_id: string;
  description?: string;
  quantity: number;
  unit_price: number;
};

type AllocationInput = {
  doc_id: string;
  amount: number;
};

type CompanyAccounts = {
  ar_control_account_id: string | null;
  ap_control_account_id: string | null;
};

type TaxAccounts = {
  vat_output_account_id: string | null;
  nhil_output_account_id: string | null;
  getfund_output_account_id: string | null;
  wht_receivable_account_id: string | null;
  wht_payable_account_id: string | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const insertAuditLog = async (payload: AuditPayload) => {
  const { error } = await supabaseAdmin().from("audit_logs").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
};

const getCompanyAccounts = async (companyId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("company_accounts")
    .select("ar_control_account_id, ap_control_account_id")
    .eq("company_id", companyId)
    .single();

  if (error) {
    return null;
  }

  return data as CompanyAccounts;
};

const getTaxAccounts = async (companyId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("tax_accounts")
    .select(
      "vat_output_account_id, nhil_output_account_id, getfund_output_account_id, wht_receivable_account_id, wht_payable_account_id"
    )
    .eq("company_id", companyId)
    .single();

  if (error) {
    return null;
  }

  return data as TaxAccounts;
};

const getLatestTaxRates = async (companyId: string, asOf: string) => {
  const { data, error } = await supabaseAdmin()
    .from("tax_rates")
    .select("tax, rate, effective_from")
    .eq("company_id", companyId)
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    if (!map.has(row.tax)) {
      map.set(row.tax, Number(row.rate) || 0);
    }
  }

  return {
    vat: map.get("VAT") ?? 0,
    nhil: map.get("NHIL") ?? 0,
    getfund: map.get("GETFund") ?? 0,
    wht: map.get("WHT") ?? 0,
  };
};

const ensurePeriodOpen = async (periodId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("periods")
    .select("status")
    .eq("id", periodId)
    .single();

  if (error || !data) {
    throw new Error("Period not found.");
  }

  if (data.status !== "open") {
    throw new Error("Period is closed.");
  }
};

const computeLinesTotals = (lines: DocumentLineInput[]) => {
  const normalized = lines
    .map((line) => ({
      account_id: line.account_id,
      description: line.description ?? "",
      quantity: Number(line.quantity) || 0,
      unit_price: Number(line.unit_price) || 0,
    }))
    .filter((line) => line.account_id && line.quantity > 0);

  if (normalized.length === 0) {
    throw new Error("At least one line is required.");
  }

  const lineTotals = normalized.map((line) =>
    round2(line.quantity * line.unit_price)
  );

  const totalNet = round2(lineTotals.reduce((sum, value) => sum + value, 0));

  return { normalized, lineTotals, totalNet };
};

export const createInvoiceDraft = async (payload: {
  company_id: string;
  customer_id: string;
  period_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  narration: string;
  lines: DocumentLineInput[];
}) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, payload.company_id);

  const { normalized, lineTotals, totalNet } = computeLinesTotals(payload.lines);

  const { data: customer, error: customerError } = await supabaseAdmin()
    .from("customers")
    .select("tax_exempt")
    .eq("id", payload.customer_id)
    .eq("company_id", payload.company_id)
    .single();

  if (customerError || !customer) {
    throw new Error("Customer not found.");
  }

  const taxRates = await getLatestTaxRates(
    payload.company_id,
    payload.invoice_date
  );
  const totalTax = customer.tax_exempt
    ? 0
    : round2(
        totalNet * (taxRates.vat / 100) +
          totalNet * (taxRates.nhil / 100) +
          totalNet * (taxRates.getfund / 100)
      );

  const totalGross = round2(totalNet + totalTax);

  const { data: invoice, error } = await supabaseAdmin()
    .from("invoices")
    .insert({
      company_id: payload.company_id,
      customer_id: payload.customer_id,
      period_id: payload.period_id,
      invoice_no: payload.invoice_no,
      invoice_date: payload.invoice_date,
      due_date: payload.due_date,
      narration: payload.narration,
      status: "draft",
      total_net: totalNet,
      total_tax: totalTax,
      total_gross: totalGross,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Failed to create invoice.");
  }

  const { error: lineError } = await supabaseAdmin()
    .from("invoice_lines")
    .insert(
      normalized.map((line, index) => ({
        invoice_id: invoice.id,
        income_account_id: line.account_id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        net_amount: lineTotals[index],
      }))
    );

  if (lineError) {
    throw new Error(lineError.message);
  }

  await insertAuditLog({
    company_id: payload.company_id,
    entity: "invoices",
    entity_id: invoice.id,
    action: "created",
    after: { total_net: totalNet, total_tax: totalTax, total_gross: totalGross },
    created_by: user.id,
  });

  return invoice.id as string;
};

export const submitInvoice = async (invoice_id: string) => {
  const user = await requireUser();

  const { data: invoice, error } = await supabaseAdmin()
    .from("invoices")
    .select("id, company_id, status, created_by")
    .eq("id", invoice_id)
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Invoice not found.");
  }

  if (invoice.created_by !== user.id) {
    throw new Error("Only the maker can submit this invoice.");
  }

  if (invoice.status !== "draft") {
    throw new Error("Only draft invoices can be submitted.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("invoices")
    .update({ status: "submitted" })
    .eq("id", invoice_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: invoice.company_id,
    entity: "invoices",
    entity_id: invoice_id,
    action: "submitted",
    before: { status: invoice.status },
    after: { status: "submitted" },
    created_by: user.id,
  });
};

export const approveInvoice = async (invoice_id: string) => {
  const user = await requireUser();

  const { data: invoice, error } = await supabaseAdmin()
    .from("invoices")
    .select("id, company_id, status, created_by")
    .eq("id", invoice_id)
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Invoice not found.");
  }

  await requireCompanyRole(user.id, invoice.company_id, ["Admin", "Manager"]);

  if (invoice.created_by === user.id) {
    throw new Error("Makers cannot approve their own invoices.");
  }

  if (invoice.status !== "submitted") {
    throw new Error("Only submitted invoices can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("invoices")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", invoice_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: invoice.company_id,
    entity: "invoices",
    entity_id: invoice_id,
    action: "approved",
    before: { status: invoice.status },
    after: { status: "approved" },
    created_by: user.id,
  });
};

export const rejectInvoice = async (invoice_id: string, note: string) => {
  const user = await requireUser();

  const { data: invoice, error } = await supabaseAdmin()
    .from("invoices")
    .select("id, company_id, status")
    .eq("id", invoice_id)
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Invoice not found.");
  }

  await requireCompanyRole(user.id, invoice.company_id, ["Admin", "Manager"]);

  if (invoice.status !== "submitted") {
    throw new Error("Only submitted invoices can be rejected.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("invoices")
    .update({ status: "draft", reject_note: note })
    .eq("id", invoice_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: invoice.company_id,
    entity: "invoices",
    entity_id: invoice_id,
    action: "rejected",
    before: { status: invoice.status },
    after: { status: "draft", note },
    created_by: user.id,
  });
};

export const postInvoice = async (invoice_id: string) => {
  const user = await requireUser();

  const { data: invoice, error } = await supabaseAdmin()
    .from("invoices")
    .select(
      "id, company_id, period_id, invoice_date, narration, status, total_net, total_tax, total_gross, customer_id"
    )
    .eq("id", invoice_id)
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Invoice not found.");
  }

  await requireCompanyRole(user.id, invoice.company_id, ["Admin", "Manager"]);

  if (invoice.status !== "approved") {
    throw new Error("Only approved invoices can be posted.");
  }

  await ensurePeriodOpen(invoice.period_id);

  const { data: customer, error: customerError } = await supabaseAdmin()
    .from("customers")
    .select("tax_exempt")
    .eq("id", invoice.customer_id)
    .eq("company_id", invoice.company_id)
    .single();

  if (customerError || !customer) {
    throw new Error("Customer not found.");
  }

  const accounts = await getCompanyAccounts(invoice.company_id);
  if (!accounts?.ar_control_account_id) {
    throw new Error("AR control account is not configured.");
  }

  const taxAccounts = await getTaxAccounts(invoice.company_id);

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("invoice_lines")
    .select("income_account_id, net_amount")
    .eq("invoice_id", invoice_id);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];

  journalLines.push({
    account_id: accounts.ar_control_account_id,
    debit: Number(invoice.total_gross) || 0,
    credit: 0,
  });

  for (const line of lines ?? []) {
    journalLines.push({
      account_id: line.income_account_id,
      debit: 0,
      credit: Number(line.net_amount) || 0,
    });
  }

  if (!customer.tax_exempt && Number(invoice.total_tax) > 0) {
    const taxRates = await getLatestTaxRates(
      invoice.company_id,
      invoice.invoice_date
    );

    if (taxRates.vat > 0) {
      if (!taxAccounts?.vat_output_account_id) {
        throw new Error("VAT output account is not configured.");
      }
      journalLines.push({
        account_id: taxAccounts.vat_output_account_id,
        debit: 0,
        credit: round2((Number(invoice.total_net) || 0) * (taxRates.vat / 100)),
      });
    }

    if (taxRates.nhil > 0) {
      if (!taxAccounts?.nhil_output_account_id) {
        throw new Error("NHIL output account is not configured.");
      }
      journalLines.push({
        account_id: taxAccounts.nhil_output_account_id,
        debit: 0,
        credit: round2(
          (Number(invoice.total_net) || 0) * (taxRates.nhil / 100)
        ),
      });
    }

    if (taxRates.getfund > 0) {
      if (!taxAccounts?.getfund_output_account_id) {
        throw new Error("GETFund output account is not configured.");
      }
      journalLines.push({
        account_id: taxAccounts.getfund_output_account_id,
        debit: 0,
        credit: round2(
          (Number(invoice.total_net) || 0) * (taxRates.getfund / 100)
        ),
      });
    }
  }

  const journalId = await createPostedJournalFromLines({
    company_id: invoice.company_id,
    period_id: invoice.period_id,
    entry_date: invoice.invoice_date,
    narration: invoice.narration ?? "Invoice",
    lines: journalLines,
    user_id: user.id,
  });

  await supabaseAdmin().from("doc_journals").insert({
    company_id: invoice.company_id,
    doc_type: "invoice",
    doc_id: invoice.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("invoices")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", invoice_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: invoice.company_id,
    entity: "invoices",
    entity_id: invoice_id,
    action: "posted",
    before: { status: invoice.status },
    after: { status: "posted", journal_id: journalId },
    created_by: user.id,
  });
};
export const createReceiptDraft = async (payload: {
  company_id: string;
  customer_id: string;
  period_id: string;
  receipt_no: string;
  receipt_date: string;
  method: "bank" | "momo" | "cash" | "cheque";
  cash_account_id: string;
  amount_received: number;
  wht_deducted: number;
  allocations: AllocationInput[];
}) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, payload.company_id);

  const normalizedAllocations = payload.allocations
    .map((allocation) => ({
      doc_id: allocation.doc_id,
      amount: Number(allocation.amount) || 0,
    }))
    .filter((allocation) => allocation.doc_id && allocation.amount > 0);

  if (normalizedAllocations.length === 0) {
    throw new Error("Receipt must allocate at least one invoice.");
  }

  const totalAllocated = round2(
    normalizedAllocations.reduce((sum, item) => sum + item.amount, 0)
  );

  const amountReceived = round2(Number(payload.amount_received) || 0);
  const whtDeducted = round2(Number(payload.wht_deducted) || 0);

  if (round2(amountReceived + whtDeducted) !== totalAllocated) {
    throw new Error("Received + WHT must equal allocated total.");
  }

  const { data: customer, error: customerError } = await supabaseAdmin()
    .from("customers")
    .select("wht_applicable")
    .eq("id", payload.customer_id)
    .eq("company_id", payload.company_id)
    .single();

  if (customerError || !customer) {
    throw new Error("Customer not found.");
  }

  if (!customer.wht_applicable && whtDeducted > 0) {
    throw new Error("Customer is not WHT applicable.");
  }

  const { data: receipt, error } = await supabaseAdmin()
    .from("receipts")
    .insert({
      company_id: payload.company_id,
      customer_id: payload.customer_id,
      period_id: payload.period_id,
      receipt_no: payload.receipt_no,
      receipt_date: payload.receipt_date,
      method: payload.method,
      cash_account_id: payload.cash_account_id,
      amount_received: amountReceived,
      wht_deducted: whtDeducted,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !receipt) {
    throw new Error(error?.message ?? "Failed to create receipt.");
  }

  const { error: allocError } = await supabaseAdmin()
    .from("receipt_allocations")
    .insert(
      normalizedAllocations.map((allocation) => ({
        receipt_id: receipt.id,
        invoice_id: allocation.doc_id,
        amount_allocated: allocation.amount,
      }))
    );

  if (allocError) {
    throw new Error(allocError.message);
  }

  await insertAuditLog({
    company_id: payload.company_id,
    entity: "receipts",
    entity_id: receipt.id,
    action: "created",
    after: { amount_received: amountReceived, wht_deducted: whtDeducted },
    created_by: user.id,
  });

  return receipt.id as string;
};

export const submitReceipt = async (receipt_id: string) => {
  const user = await requireUser();

  const { data: receipt, error } = await supabaseAdmin()
    .from("receipts")
    .select("id, company_id, status, created_by")
    .eq("id", receipt_id)
    .single();

  if (error || !receipt) {
    throw new Error(error?.message ?? "Receipt not found.");
  }

  if (receipt.created_by !== user.id) {
    throw new Error("Only the maker can submit this receipt.");
  }

  if (receipt.status !== "draft") {
    throw new Error("Only draft receipts can be submitted.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("receipts")
    .update({ status: "submitted" })
    .eq("id", receipt_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: receipt.company_id,
    entity: "receipts",
    entity_id: receipt_id,
    action: "submitted",
    before: { status: receipt.status },
    after: { status: "submitted" },
    created_by: user.id,
  });
};

export const approveReceipt = async (receipt_id: string) => {
  const user = await requireUser();

  const { data: receipt, error } = await supabaseAdmin()
    .from("receipts")
    .select("id, company_id, status, created_by")
    .eq("id", receipt_id)
    .single();

  if (error || !receipt) {
    throw new Error(error?.message ?? "Receipt not found.");
  }

  await requireCompanyRole(user.id, receipt.company_id, ["Admin", "Manager"]);

  if (receipt.created_by === user.id) {
    throw new Error("Makers cannot approve their own receipts.");
  }

  if (receipt.status !== "submitted") {
    throw new Error("Only submitted receipts can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("receipts")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", receipt_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: receipt.company_id,
    entity: "receipts",
    entity_id: receipt_id,
    action: "approved",
    before: { status: receipt.status },
    after: { status: "approved" },
    created_by: user.id,
  });
};

export const rejectReceipt = async (receipt_id: string, note: string) => {
  const user = await requireUser();

  const { data: receipt, error } = await supabaseAdmin()
    .from("receipts")
    .select("id, company_id, status")
    .eq("id", receipt_id)
    .single();

  if (error || !receipt) {
    throw new Error(error?.message ?? "Receipt not found.");
  }

  await requireCompanyRole(user.id, receipt.company_id, ["Admin", "Manager"]);

  if (receipt.status !== "submitted") {
    throw new Error("Only submitted receipts can be rejected.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("receipts")
    .update({ status: "draft", reject_note: note })
    .eq("id", receipt_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: receipt.company_id,
    entity: "receipts",
    entity_id: receipt_id,
    action: "rejected",
    before: { status: receipt.status },
    after: { status: "draft", note },
    created_by: user.id,
  });
};

export const postReceipt = async (receipt_id: string) => {
  const user = await requireUser();

  const { data: receipt, error } = await supabaseAdmin()
    .from("receipts")
    .select(
      "id, company_id, period_id, receipt_date, status, amount_received, wht_deducted, cash_account_id, customer_id"
    )
    .eq("id", receipt_id)
    .single();

  if (error || !receipt) {
    throw new Error(error?.message ?? "Receipt not found.");
  }

  await requireCompanyRole(user.id, receipt.company_id, ["Admin", "Manager"]);

  if (receipt.status !== "approved") {
    throw new Error("Only approved receipts can be posted.");
  }

  await ensurePeriodOpen(receipt.period_id);

  const accounts = await getCompanyAccounts(receipt.company_id);
  if (!accounts?.ar_control_account_id) {
    throw new Error("AR control account is not configured.");
  }

  const taxAccounts = await getTaxAccounts(receipt.company_id);

  if (Number(receipt.wht_deducted) > 0 && !taxAccounts?.wht_receivable_account_id) {
    throw new Error("WHT receivable account is not configured.");
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("receipt_allocations")
    .select("amount_allocated")
    .eq("receipt_id", receipt_id);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const totalAllocated = round2(
    (allocations ?? []).reduce(
      (sum, row) => sum + Number(row.amount_allocated || 0),
      0
    )
  );

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];
  journalLines.push({
    account_id: receipt.cash_account_id,
    debit: Number(receipt.amount_received) || 0,
    credit: 0,
  });

  if (Number(receipt.wht_deducted) > 0 && taxAccounts?.wht_receivable_account_id) {
    journalLines.push({
      account_id: taxAccounts.wht_receivable_account_id,
      debit: Number(receipt.wht_deducted) || 0,
      credit: 0,
    });
  }

  journalLines.push({
    account_id: accounts.ar_control_account_id,
    debit: 0,
    credit: totalAllocated,
  });

  const journalId = await createPostedJournalFromLines({
    company_id: receipt.company_id,
    period_id: receipt.period_id,
    entry_date: receipt.receipt_date,
    narration: "Receipt",
    lines: journalLines,
    user_id: user.id,
  });

  await supabaseAdmin().from("doc_journals").insert({
    company_id: receipt.company_id,
    doc_type: "receipt",
    doc_id: receipt.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("receipts")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", receipt_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: receipt.company_id,
    entity: "receipts",
    entity_id: receipt_id,
    action: "posted",
    before: { status: receipt.status },
    after: { status: "posted", journal_id: journalId },
    created_by: user.id,
  });
};

export const createBillDraft = async (payload: {
  company_id: string;
  supplier_id: string;
  period_id: string;
  bill_no: string;
  bill_date: string;
  due_date: string | null;
  narration: string;
  lines: DocumentLineInput[];
}) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, payload.company_id);

  const { normalized, lineTotals, totalNet } = computeLinesTotals(payload.lines);

  const { data: bill, error } = await supabaseAdmin()
    .from("bills")
    .insert({
      company_id: payload.company_id,
      supplier_id: payload.supplier_id,
      period_id: payload.period_id,
      bill_no: payload.bill_no,
      bill_date: payload.bill_date,
      due_date: payload.due_date,
      narration: payload.narration,
      status: "draft",
      total_net: totalNet,
      total_tax: 0,
      total_gross: totalNet,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Failed to create bill.");
  }

  const { error: lineError } = await supabaseAdmin()
    .from("bill_lines")
    .insert(
      normalized.map((line, index) => ({
        bill_id: bill.id,
        expense_account_id: line.account_id,
        description: line.description,
        net_amount: lineTotals[index],
      }))
    );

  if (lineError) {
    throw new Error(lineError.message);
  }

  await insertAuditLog({
    company_id: payload.company_id,
    entity: "bills",
    entity_id: bill.id,
    action: "created",
    after: { total_net: totalNet },
    created_by: user.id,
  });

  return bill.id as string;
};

export const submitBill = async (bill_id: string) => {
  const user = await requireUser();

  const { data: bill, error } = await supabaseAdmin()
    .from("bills")
    .select("id, company_id, status, created_by")
    .eq("id", bill_id)
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Bill not found.");
  }

  if (bill.created_by !== user.id) {
    throw new Error("Only the maker can submit this bill.");
  }

  if (bill.status !== "draft") {
    throw new Error("Only draft bills can be submitted.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("bills")
    .update({ status: "submitted" })
    .eq("id", bill_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: bill.company_id,
    entity: "bills",
    entity_id: bill_id,
    action: "submitted",
    before: { status: bill.status },
    after: { status: "submitted" },
    created_by: user.id,
  });
};

export const approveBill = async (bill_id: string) => {
  const user = await requireUser();

  const { data: bill, error } = await supabaseAdmin()
    .from("bills")
    .select("id, company_id, status, created_by")
    .eq("id", bill_id)
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Bill not found.");
  }

  await requireCompanyRole(user.id, bill.company_id, ["Admin", "Manager"]);

  if (bill.created_by === user.id) {
    throw new Error("Makers cannot approve their own bills.");
  }

  if (bill.status !== "submitted") {
    throw new Error("Only submitted bills can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("bills")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", bill_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: bill.company_id,
    entity: "bills",
    entity_id: bill_id,
    action: "approved",
    before: { status: bill.status },
    after: { status: "approved" },
    created_by: user.id,
  });
};

export const rejectBill = async (bill_id: string, note: string) => {
  const user = await requireUser();

  const { data: bill, error } = await supabaseAdmin()
    .from("bills")
    .select("id, company_id, status")
    .eq("id", bill_id)
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Bill not found.");
  }

  await requireCompanyRole(user.id, bill.company_id, ["Admin", "Manager"]);

  if (bill.status !== "submitted") {
    throw new Error("Only submitted bills can be rejected.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("bills")
    .update({ status: "draft", reject_note: note })
    .eq("id", bill_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: bill.company_id,
    entity: "bills",
    entity_id: bill_id,
    action: "rejected",
    before: { status: bill.status },
    after: { status: "draft", note },
    created_by: user.id,
  });
};

export const postBill = async (bill_id: string) => {
  const user = await requireUser();

  const { data: bill, error } = await supabaseAdmin()
    .from("bills")
    .select("id, company_id, period_id, bill_date, narration, status, total_gross")
    .eq("id", bill_id)
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Bill not found.");
  }

  await requireCompanyRole(user.id, bill.company_id, ["Admin", "Manager"]);

  if (bill.status !== "approved") {
    throw new Error("Only approved bills can be posted.");
  }

  await ensurePeriodOpen(bill.period_id);

  const accounts = await getCompanyAccounts(bill.company_id);
  if (!accounts?.ap_control_account_id) {
    throw new Error("AP control account is not configured.");
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("bill_lines")
    .select("expense_account_id, net_amount")
    .eq("bill_id", bill_id);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];

  for (const line of lines ?? []) {
    journalLines.push({
      account_id: line.expense_account_id,
      debit: Number(line.net_amount) || 0,
      credit: 0,
    });
  }

  journalLines.push({
    account_id: accounts.ap_control_account_id,
    debit: 0,
    credit: Number(bill.total_gross) || 0,
  });

  const journalId = await createPostedJournalFromLines({
    company_id: bill.company_id,
    period_id: bill.period_id,
    entry_date: bill.bill_date,
    narration: bill.narration ?? "Bill",
    lines: journalLines,
    user_id: user.id,
  });

  await supabaseAdmin().from("doc_journals").insert({
    company_id: bill.company_id,
    doc_type: "bill",
    doc_id: bill.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("bills")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", bill_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: bill.company_id,
    entity: "bills",
    entity_id: bill_id,
    action: "posted",
    before: { status: bill.status },
    after: { status: "posted", journal_id: journalId },
    created_by: user.id,
  });
};
export const createVoucherDraft = async (payload: {
  company_id: string;
  supplier_id: string;
  period_id: string;
  voucher_no: string;
  payment_date: string;
  method: "bank" | "momo" | "cash" | "cheque";
  cash_account_id: string;
  amount_paid: number;
  wht_deducted: number;
  allocations: AllocationInput[];
}) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, payload.company_id);

  const normalizedAllocations = payload.allocations
    .map((allocation) => ({
      doc_id: allocation.doc_id,
      amount: Number(allocation.amount) || 0,
    }))
    .filter((allocation) => allocation.doc_id && allocation.amount > 0);

  if (normalizedAllocations.length === 0) {
    throw new Error("Voucher must allocate at least one bill.");
  }

  const totalAllocated = round2(
    normalizedAllocations.reduce((sum, item) => sum + item.amount, 0)
  );

  const amountPaid = round2(Number(payload.amount_paid) || 0);
  const whtDeducted = round2(Number(payload.wht_deducted) || 0);

  if (round2(amountPaid + whtDeducted) !== totalAllocated) {
    throw new Error("Paid + WHT must equal allocated total.");
  }

  const { data: supplier, error: supplierError } = await supabaseAdmin()
    .from("suppliers")
    .select("wht_applicable")
    .eq("id", payload.supplier_id)
    .eq("company_id", payload.company_id)
    .single();

  if (supplierError || !supplier) {
    throw new Error("Supplier not found.");
  }

  if (!supplier.wht_applicable && whtDeducted > 0) {
    throw new Error("Supplier is not WHT applicable.");
  }

  const { data: voucher, error } = await supabaseAdmin()
    .from("payment_vouchers")
    .insert({
      company_id: payload.company_id,
      supplier_id: payload.supplier_id,
      period_id: payload.period_id,
      voucher_no: payload.voucher_no,
      payment_date: payload.payment_date,
      method: payload.method,
      cash_account_id: payload.cash_account_id,
      amount_paid: amountPaid,
      wht_deducted: whtDeducted,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !voucher) {
    throw new Error(error?.message ?? "Failed to create voucher.");
  }

  const { error: allocError } = await supabaseAdmin()
    .from("payment_allocations")
    .insert(
      normalizedAllocations.map((allocation) => ({
        voucher_id: voucher.id,
        bill_id: allocation.doc_id,
        amount_allocated: allocation.amount,
      }))
    );

  if (allocError) {
    throw new Error(allocError.message);
  }

  await insertAuditLog({
    company_id: payload.company_id,
    entity: "payment_vouchers",
    entity_id: voucher.id,
    action: "created",
    after: { amount_paid: amountPaid, wht_deducted: whtDeducted },
    created_by: user.id,
  });

  return voucher.id as string;
};

export const submitVoucher = async (voucher_id: string) => {
  const user = await requireUser();

  const { data: voucher, error } = await supabaseAdmin()
    .from("payment_vouchers")
    .select("id, company_id, status, created_by")
    .eq("id", voucher_id)
    .single();

  if (error || !voucher) {
    throw new Error(error?.message ?? "Voucher not found.");
  }

  if (voucher.created_by !== user.id) {
    throw new Error("Only the maker can submit this voucher.");
  }

  if (voucher.status !== "draft") {
    throw new Error("Only draft vouchers can be submitted.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("payment_vouchers")
    .update({ status: "submitted" })
    .eq("id", voucher_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: voucher.company_id,
    entity: "payment_vouchers",
    entity_id: voucher_id,
    action: "submitted",
    before: { status: voucher.status },
    after: { status: "submitted" },
    created_by: user.id,
  });
};

export const approveVoucher = async (voucher_id: string) => {
  const user = await requireUser();

  const { data: voucher, error } = await supabaseAdmin()
    .from("payment_vouchers")
    .select("id, company_id, status, created_by")
    .eq("id", voucher_id)
    .single();

  if (error || !voucher) {
    throw new Error(error?.message ?? "Voucher not found.");
  }

  await requireCompanyRole(user.id, voucher.company_id, ["Admin", "Manager"]);

  if (voucher.created_by === user.id) {
    throw new Error("Makers cannot approve their own vouchers.");
  }

  if (voucher.status !== "submitted") {
    throw new Error("Only submitted vouchers can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("payment_vouchers")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", voucher_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: voucher.company_id,
    entity: "payment_vouchers",
    entity_id: voucher_id,
    action: "approved",
    before: { status: voucher.status },
    after: { status: "approved" },
    created_by: user.id,
  });
};

export const rejectVoucher = async (voucher_id: string, note: string) => {
  const user = await requireUser();

  const { data: voucher, error } = await supabaseAdmin()
    .from("payment_vouchers")
    .select("id, company_id, status")
    .eq("id", voucher_id)
    .single();

  if (error || !voucher) {
    throw new Error(error?.message ?? "Voucher not found.");
  }

  await requireCompanyRole(user.id, voucher.company_id, ["Admin", "Manager"]);

  if (voucher.status !== "submitted") {
    throw new Error("Only submitted vouchers can be rejected.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("payment_vouchers")
    .update({ status: "draft", reject_note: note })
    .eq("id", voucher_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: voucher.company_id,
    entity: "payment_vouchers",
    entity_id: voucher_id,
    action: "rejected",
    before: { status: voucher.status },
    after: { status: "draft", note },
    created_by: user.id,
  });
};

export const postVoucher = async (voucher_id: string) => {
  const user = await requireUser();

  const { data: voucher, error } = await supabaseAdmin()
    .from("payment_vouchers")
    .select(
      "id, company_id, period_id, payment_date, status, amount_paid, wht_deducted, cash_account_id"
    )
    .eq("id", voucher_id)
    .single();

  if (error || !voucher) {
    throw new Error(error?.message ?? "Voucher not found.");
  }

  await requireCompanyRole(user.id, voucher.company_id, ["Admin", "Manager"]);

  if (voucher.status !== "approved") {
    throw new Error("Only approved vouchers can be posted.");
  }

  await ensurePeriodOpen(voucher.period_id);

  const accounts = await getCompanyAccounts(voucher.company_id);
  if (!accounts?.ap_control_account_id) {
    throw new Error("AP control account is not configured.");
  }

  const taxAccounts = await getTaxAccounts(voucher.company_id);

  if (Number(voucher.wht_deducted) > 0 && !taxAccounts?.wht_payable_account_id) {
    throw new Error("WHT payable account is not configured.");
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("payment_allocations")
    .select("amount_allocated")
    .eq("voucher_id", voucher_id);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const totalAllocated = round2(
    (allocations ?? []).reduce(
      (sum, row) => sum + Number(row.amount_allocated || 0),
      0
    )
  );

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];

  journalLines.push({
    account_id: accounts.ap_control_account_id,
    debit: totalAllocated,
    credit: 0,
  });

  journalLines.push({
    account_id: voucher.cash_account_id,
    debit: 0,
    credit: Number(voucher.amount_paid) || 0,
  });

  if (Number(voucher.wht_deducted) > 0 && taxAccounts?.wht_payable_account_id) {
    journalLines.push({
      account_id: taxAccounts.wht_payable_account_id,
      debit: 0,
      credit: Number(voucher.wht_deducted) || 0,
    });
  }

  const journalId = await createPostedJournalFromLines({
    company_id: voucher.company_id,
    period_id: voucher.period_id,
    entry_date: voucher.payment_date,
    narration: "Payment voucher",
    lines: journalLines,
    user_id: user.id,
  });

  await supabaseAdmin().from("doc_journals").insert({
    company_id: voucher.company_id,
    doc_type: "voucher",
    doc_id: voucher.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("payment_vouchers")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", voucher_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: voucher.company_id,
    entity: "payment_vouchers",
    entity_id: voucher_id,
    action: "posted",
    before: { status: voucher.status },
    after: { status: "posted", journal_id: journalId },
    created_by: user.id,
  });
};

export const getArReconciliation = async (companyId: string) => {
  const { data: invoices, error: invError } = await supabaseAdmin()
    .from("invoices")
    .select("id, customer_id, total_gross")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (invError) {
    throw new Error(invError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("receipt_allocations")
    .select("invoice_id, amount_allocated, receipts!inner(status, company_id)")
    .eq("receipts.status", "posted")
    .eq("receipts.company_id", companyId);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const allocationTotals = new Map<string, number>();
  for (const alloc of allocations ?? []) {
    allocationTotals.set(
      alloc.invoice_id,
      round2((allocationTotals.get(alloc.invoice_id) ?? 0) + Number(alloc.amount_allocated || 0))
    );
  }

  const customerBalances = new Map<string, number>();
  for (const inv of invoices ?? []) {
    const allocated = allocationTotals.get(inv.id) ?? 0;
    const balance = round2(Number(inv.total_gross || 0) - allocated);
    customerBalances.set(
      inv.customer_id,
      round2((customerBalances.get(inv.customer_id) ?? 0) + balance)
    );
  }

  const totalCustomerBalance = round2(
    Array.from(customerBalances.values()).reduce((sum, value) => sum + value, 0)
  );

  const accounts = await getCompanyAccounts(companyId);
  let arControlBalance = 0;
  if (accounts?.ar_control_account_id) {
    const { data: lines, error: lineError } = await supabaseAdmin()
      .from("journal_lines")
      .select("debit, credit, journal_entries!inner(status, company_id)")
      .eq("journal_entries.status", "posted")
      .eq("journal_entries.company_id", companyId)
      .eq("account_id", accounts.ar_control_account_id);

    if (lineError) {
      throw new Error(lineError.message);
    }

    arControlBalance = round2(
      (lines ?? []).reduce(
        (sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0),
        0
      )
    );
  }

  return {
    totalCustomerBalance,
    arControlBalance,
    difference: round2(arControlBalance - totalCustomerBalance),
    customerBalances,
  };
};

export const getApReconciliation = async (companyId: string) => {
  const { data: bills, error: billError } = await supabaseAdmin()
    .from("bills")
    .select("id, supplier_id, total_gross")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (billError) {
    throw new Error(billError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("payment_allocations")
    .select("bill_id, amount_allocated, payment_vouchers!inner(status, company_id)")
    .eq("payment_vouchers.status", "posted")
    .eq("payment_vouchers.company_id", companyId);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const allocationTotals = new Map<string, number>();
  for (const alloc of allocations ?? []) {
    allocationTotals.set(
      alloc.bill_id,
      round2((allocationTotals.get(alloc.bill_id) ?? 0) + Number(alloc.amount_allocated || 0))
    );
  }

  const supplierBalances = new Map<string, number>();
  for (const bill of bills ?? []) {
    const allocated = allocationTotals.get(bill.id) ?? 0;
    const balance = round2(Number(bill.total_gross || 0) - allocated);
    supplierBalances.set(
      bill.supplier_id,
      round2((supplierBalances.get(bill.supplier_id) ?? 0) + balance)
    );
  }

  const totalSupplierBalance = round2(
    Array.from(supplierBalances.values()).reduce((sum, value) => sum + value, 0)
  );

  const accounts = await getCompanyAccounts(companyId);
  let apControlBalance = 0;
  if (accounts?.ap_control_account_id) {
    const { data: lines, error: lineError } = await supabaseAdmin()
      .from("journal_lines")
      .select("debit, credit, journal_entries!inner(status, company_id)")
      .eq("journal_entries.status", "posted")
      .eq("journal_entries.company_id", companyId)
      .eq("account_id", accounts.ap_control_account_id);

    if (lineError) {
      throw new Error(lineError.message);
    }

    apControlBalance = round2(
      (lines ?? []).reduce(
        (sum, line) => sum + Number(line.credit || 0) - Number(line.debit || 0),
        0
      )
    );
  }

  return {
    totalSupplierBalance,
    apControlBalance,
    difference: round2(apControlBalance - totalSupplierBalance),
    supplierBalances,
  };
};
