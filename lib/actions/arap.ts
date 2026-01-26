"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  requireCompanyAccess,
  requireCompanyRole,
  requireUser,
} from "@/lib/auth";

export type InvoiceLineInput = {
  account_id: string;
  description?: string;
  quantity: number;
  unit_price: number;
};

export type BillLineInput = {
  account_id: string;
  description?: string;
  quantity: number;
  unit_price: number;
};

export type AllocationInput = {
  doc_id: string;
  amount: number;
};

type CompanyAccounts = {
  ar_control_account_id: string | null;
  ap_control_account_id: string | null;
  wht_receivable_account_id: string | null;
  wht_payable_account_id: string | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const getCompanyAccounts = async (companyId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("company_accounts")
    .select(
      "ar_control_account_id, ap_control_account_id, wht_receivable_account_id, wht_payable_account_id"
    )
    .eq("company_id", companyId)
    .single();

  if (error) {
    return null;
  }

  return data as CompanyAccounts;
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

const createPostedJournal = async (
  companyId: string,
  periodId: string,
  entryDate: string,
  narration: string,
  createdBy: string,
  lines: Array<{ account_id: string; debit: number; credit: number }>
) => {
  const totals = lines.reduce(
    (acc, line) => {
      acc.debit += line.debit;
      acc.credit += line.credit;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  if (Math.abs(totals.debit - totals.credit) > 0.005) {
    throw new Error("Journal is not balanced.");
  }

  await ensurePeriodOpen(periodId);

  const { data: journal, error } = await supabaseAdmin()
    .from("journal_entries")
    .insert({
      company_id: companyId,
      period_id: periodId,
      entry_date: entryDate,
      narration,
      status: "posted",
      created_by: createdBy,
      approved_by: createdBy,
      approved_at: new Date().toISOString(),
      posted_by: createdBy,
      posted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !journal) {
    throw new Error(error?.message ?? "Failed to create journal.");
  }

  const { error: lineError } = await supabaseAdmin()
    .from("journal_lines")
    .insert(
      lines.map((line) => ({
        journal_id: journal.id,
        account_id: line.account_id,
        debit: line.debit,
        credit: line.credit,
      }))
    );

  if (lineError) {
    throw new Error(lineError.message);
  }

  return journal.id as string;
};

export const createInvoiceDraft = async (
  company_id: string,
  customer_id: string,
  period_id: string,
  invoice_date: string,
  due_date: string,
  narration: string,
  tax_exempt: boolean,
  vat_rate_id: string | null,
  nhil_rate_id: string | null,
  getfund_rate_id: string | null,
  lines: InvoiceLineInput[]
) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, company_id);

  const normalizedLines = lines
    .map((line) => ({
      account_id: line.account_id,
      description: line.description ?? "",
      quantity: Number(line.quantity) || 0,
      unit_price: Number(line.unit_price) || 0,
    }))
    .filter((line) => line.account_id && line.quantity > 0);

  if (normalizedLines.length === 0) {
    throw new Error("Invoice must have at least one line.");
  }

  const lineTotals = normalizedLines.map((line) =>
    round2(line.quantity * line.unit_price)
  );
  const totalNet = round2(lineTotals.reduce((sum, value) => sum + value, 0));

  let totalTax = 0;
  const taxIds = [vat_rate_id, nhil_rate_id, getfund_rate_id].filter(
    Boolean
  ) as string[];
  const taxRates: Record<string, number> = {};

  if (!tax_exempt && taxIds.length > 0) {
    const { data: taxes, error } = await supabaseAdmin()
      .from("tax_rates")
      .select("id, rate")
      .in("id", taxIds)
      .eq("company_id", company_id);

    if (error) {
      throw new Error(error.message);
    }

    for (const tax of taxes ?? []) {
      taxRates[tax.id] = Number(tax.rate) || 0;
    }

    totalTax = round2(
      taxIds.reduce((sum, id) => sum + totalNet * (taxRates[id] / 100), 0)
    );
  }

  const totalGross = round2(totalNet + totalTax);

  const { data: invoice, error } = await supabaseAdmin()
    .from("ar_invoices")
    .insert({
      company_id,
      customer_id,
      period_id,
      invoice_date,
      due_date,
      narration,
      status: "draft",
      total_net: totalNet,
      total_tax: totalTax,
      total_gross: totalGross,
      tax_exempt,
      vat_rate_id,
      nhil_rate_id,
      getfund_rate_id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Failed to create invoice.");
  }

  const { error: lineError } = await supabaseAdmin()
    .from("ar_invoice_lines")
    .insert(
      normalizedLines.map((line, index) => ({
        invoice_id: invoice.id,
        account_id: line.account_id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: lineTotals[index],
      }))
    );

  if (lineError) {
    throw new Error(lineError.message);
  }

  return invoice.id as string;
};

export const approveInvoice = async (invoice_id: string) => {
  const user = await requireUser();

  const { data: invoice, error } = await supabaseAdmin()
    .from("ar_invoices")
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

  if (invoice.status !== "draft") {
    throw new Error("Only draft invoices can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("ar_invoices")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", invoice_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const postInvoice = async (invoice_id: string) => {
  const user = await requireUser();

  const { data: invoice, error } = await supabaseAdmin()
    .from("ar_invoices")
    .select(
      "id, company_id, period_id, invoice_date, narration, status, total_net, total_tax, total_gross, tax_exempt, vat_rate_id, nhil_rate_id, getfund_rate_id"
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

  const accounts = await getCompanyAccounts(invoice.company_id);
  if (!accounts?.ar_control_account_id) {
    throw new Error("AR control account is not configured.");
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("ar_invoice_lines")
    .select("account_id, line_total")
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
      account_id: line.account_id,
      debit: 0,
      credit: Number(line.line_total) || 0,
    });
  }

  if (!invoice.tax_exempt && Number(invoice.total_tax) > 0) {
    const taxIds = [invoice.vat_rate_id, invoice.nhil_rate_id, invoice.getfund_rate_id].filter(
      Boolean
    ) as string[];

    if (taxIds.length > 0) {
      const { data: taxRates, error: taxError } = await supabaseAdmin()
        .from("tax_rates")
        .select("id, rate")
        .in("id", taxIds)
        .eq("company_id", invoice.company_id);

      if (taxError) {
        throw new Error(taxError.message);
      }

      const { data: taxAccounts, error: taxAccountError } = await supabaseAdmin()
        .from("tax_accounts")
        .select("tax_rate_id, account_id")
        .eq("company_id", invoice.company_id)
        .in("tax_rate_id", taxIds);

      if (taxAccountError) {
        throw new Error(taxAccountError.message);
      }

      const taxAccountMap = new Map(
        (taxAccounts ?? []).map((ta) => [ta.tax_rate_id, ta.account_id])
      );

      for (const tax of taxRates ?? []) {
        const accountId = taxAccountMap.get(tax.id);
        if (!accountId) {
          throw new Error("Tax account mapping missing.");
        }
        const amount = round2(
          Number(invoice.total_net) * ((Number(tax.rate) || 0) / 100)
        );
        if (amount > 0) {
          journalLines.push({ account_id: accountId, debit: 0, credit: amount });
        }
      }
    }
  }

  const journalId = await createPostedJournal(
    invoice.company_id,
    invoice.period_id,
    invoice.invoice_date,
    invoice.narration ?? "Invoice",
    user.id,
    journalLines
  );

  await supabaseAdmin().from("doc_journals").insert({
    company_id: invoice.company_id,
    doc_type: "invoice",
    doc_id: invoice.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("ar_invoices")
    .update({
      status: "posted",
      posted_by: user.id,
      posted_at: new Date().toISOString(),
    })
    .eq("id", invoice_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const createReceiptDraft = async (
  company_id: string,
  customer_id: string,
  period_id: string,
  receipt_date: string,
  cash_account_id: string,
  narration: string,
  total_received: number,
  wht_deducted: number,
  allocations: AllocationInput[]
) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, company_id);

  const normalizedAllocations = allocations
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

  const totalReceived = round2(Number(total_received) || 0);
  const totalWht = round2(Number(wht_deducted) || 0);

  if (round2(totalReceived + totalWht) !== totalAllocated) {
    throw new Error("Received + WHT must equal allocated total.");
  }

  const { data: receipt, error } = await supabaseAdmin()
    .from("ar_receipts")
    .insert({
      company_id,
      customer_id,
      period_id,
      receipt_date,
      cash_account_id,
      narration,
      status: "draft",
      total_received: totalReceived,
      wht_deducted: totalWht,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !receipt) {
    throw new Error(error?.message ?? "Failed to create receipt.");
  }

  const { error: allocError } = await supabaseAdmin()
    .from("ar_receipt_allocations")
    .insert(
      normalizedAllocations.map((allocation) => ({
        receipt_id: receipt.id,
        invoice_id: allocation.doc_id,
        amount: allocation.amount,
      }))
    );

  if (allocError) {
    throw new Error(allocError.message);
  }

  return receipt.id as string;
};

export const approveReceipt = async (receipt_id: string) => {
  const user = await requireUser();

  const { data: receipt, error } = await supabaseAdmin()
    .from("ar_receipts")
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

  if (receipt.status !== "draft") {
    throw new Error("Only draft receipts can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("ar_receipts")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", receipt_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const postReceipt = async (receipt_id: string) => {
  const user = await requireUser();

  const { data: receipt, error } = await supabaseAdmin()
    .from("ar_receipts")
    .select(
      "id, company_id, period_id, receipt_date, narration, status, total_received, wht_deducted, cash_account_id"
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

  const accounts = await getCompanyAccounts(receipt.company_id);
  if (!accounts?.ar_control_account_id) {
    throw new Error("AR control account is not configured.");
  }

  if (Number(receipt.wht_deducted) > 0 && !accounts?.wht_receivable_account_id) {
    throw new Error("WHT receivable account is not configured.");
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ar_receipt_allocations")
    .select("amount")
    .eq("receipt_id", receipt_id);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const totalAllocated = round2(
    (allocations ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];
  journalLines.push({
    account_id: receipt.cash_account_id,
    debit: Number(receipt.total_received) || 0,
    credit: 0,
  });

  if (Number(receipt.wht_deducted) > 0 && accounts?.wht_receivable_account_id) {
    journalLines.push({
      account_id: accounts.wht_receivable_account_id,
      debit: Number(receipt.wht_deducted) || 0,
      credit: 0,
    });
  }

  journalLines.push({
    account_id: accounts.ar_control_account_id,
    debit: 0,
    credit: totalAllocated,
  });

  const journalId = await createPostedJournal(
    receipt.company_id,
    receipt.period_id,
    receipt.receipt_date,
    receipt.narration ?? "Receipt",
    user.id,
    journalLines
  );

  await supabaseAdmin().from("doc_journals").insert({
    company_id: receipt.company_id,
    doc_type: "receipt",
    doc_id: receipt.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("ar_receipts")
    .update({
      status: "posted",
      posted_by: user.id,
      posted_at: new Date().toISOString(),
    })
    .eq("id", receipt_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const createBillDraft = async (
  company_id: string,
  supplier_id: string,
  period_id: string,
  bill_date: string,
  due_date: string,
  narration: string,
  lines: BillLineInput[]
) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, company_id);

  const normalizedLines = lines
    .map((line) => ({
      account_id: line.account_id,
      description: line.description ?? "",
      quantity: Number(line.quantity) || 0,
      unit_price: Number(line.unit_price) || 0,
    }))
    .filter((line) => line.account_id && line.quantity > 0);

  if (normalizedLines.length === 0) {
    throw new Error("Bill must have at least one line.");
  }

  const lineTotals = normalizedLines.map((line) =>
    round2(line.quantity * line.unit_price)
  );
  const totalNet = round2(lineTotals.reduce((sum, value) => sum + value, 0));

  const { data: bill, error } = await supabaseAdmin()
    .from("ap_bills")
    .insert({
      company_id,
      supplier_id,
      period_id,
      bill_date,
      due_date,
      narration,
      status: "draft",
      total_net: totalNet,
      total_gross: totalNet,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Failed to create bill.");
  }

  const { error: lineError } = await supabaseAdmin()
    .from("ap_bill_lines")
    .insert(
      normalizedLines.map((line, index) => ({
        bill_id: bill.id,
        account_id: line.account_id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: lineTotals[index],
      }))
    );

  if (lineError) {
    throw new Error(lineError.message);
  }

  return bill.id as string;
};

export const approveBill = async (bill_id: string) => {
  const user = await requireUser();

  const { data: bill, error } = await supabaseAdmin()
    .from("ap_bills")
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

  if (bill.status !== "draft") {
    throw new Error("Only draft bills can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("ap_bills")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", bill_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const postBill = async (bill_id: string) => {
  const user = await requireUser();

  const { data: bill, error } = await supabaseAdmin()
    .from("ap_bills")
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

  const accounts = await getCompanyAccounts(bill.company_id);
  if (!accounts?.ap_control_account_id) {
    throw new Error("AP control account is not configured.");
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("ap_bill_lines")
    .select("account_id, line_total")
    .eq("bill_id", bill_id);

  if (lineError) {
    throw new Error(lineError.message);
  }

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];

  for (const line of lines ?? []) {
    journalLines.push({
      account_id: line.account_id,
      debit: Number(line.line_total) || 0,
      credit: 0,
    });
  }

  journalLines.push({
    account_id: accounts.ap_control_account_id,
    debit: 0,
    credit: Number(bill.total_gross) || 0,
  });

  const journalId = await createPostedJournal(
    bill.company_id,
    bill.period_id,
    bill.bill_date,
    bill.narration ?? "Bill",
    user.id,
    journalLines
  );

  await supabaseAdmin().from("doc_journals").insert({
    company_id: bill.company_id,
    doc_type: "bill",
    doc_id: bill.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("ap_bills")
    .update({
      status: "posted",
      posted_by: user.id,
      posted_at: new Date().toISOString(),
    })
    .eq("id", bill_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const createPaymentVoucherDraft = async (
  company_id: string,
  supplier_id: string,
  period_id: string,
  payment_date: string,
  cash_account_id: string,
  narration: string,
  total_paid: number,
  wht_deducted: number,
  allocations: AllocationInput[]
) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, company_id);

  const normalizedAllocations = allocations
    .map((allocation) => ({
      doc_id: allocation.doc_id,
      amount: Number(allocation.amount) || 0,
    }))
    .filter((allocation) => allocation.doc_id && allocation.amount > 0);

  if (normalizedAllocations.length === 0) {
    throw new Error("Payment voucher must allocate at least one bill.");
  }

  const totalAllocated = round2(
    normalizedAllocations.reduce((sum, item) => sum + item.amount, 0)
  );

  const totalPaid = round2(Number(total_paid) || 0);
  const totalWht = round2(Number(wht_deducted) || 0);

  if (round2(totalPaid + totalWht) !== totalAllocated) {
    throw new Error("Paid + WHT must equal allocated total.");
  }

  const { data: payment, error } = await supabaseAdmin()
    .from("ap_payment_vouchers")
    .insert({
      company_id,
      supplier_id,
      period_id,
      payment_date,
      cash_account_id,
      narration,
      status: "draft",
      total_paid: totalPaid,
      wht_deducted: totalWht,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !payment) {
    throw new Error(error?.message ?? "Failed to create payment voucher.");
  }

  const { error: allocError } = await supabaseAdmin()
    .from("ap_payment_allocations")
    .insert(
      normalizedAllocations.map((allocation) => ({
        payment_voucher_id: payment.id,
        bill_id: allocation.doc_id,
        amount: allocation.amount,
      }))
    );

  if (allocError) {
    throw new Error(allocError.message);
  }

  return payment.id as string;
};

export const approvePaymentVoucher = async (payment_id: string) => {
  const user = await requireUser();

  const { data: payment, error } = await supabaseAdmin()
    .from("ap_payment_vouchers")
    .select("id, company_id, status, created_by")
    .eq("id", payment_id)
    .single();

  if (error || !payment) {
    throw new Error(error?.message ?? "Payment voucher not found.");
  }

  await requireCompanyRole(user.id, payment.company_id, ["Admin", "Manager"]);

  if (payment.created_by === user.id) {
    throw new Error("Makers cannot approve their own payment vouchers.");
  }

  if (payment.status !== "draft") {
    throw new Error("Only draft payment vouchers can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("ap_payment_vouchers")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", payment_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const postPaymentVoucher = async (payment_id: string) => {
  const user = await requireUser();

  const { data: payment, error } = await supabaseAdmin()
    .from("ap_payment_vouchers")
    .select(
      "id, company_id, period_id, payment_date, narration, status, total_paid, wht_deducted, cash_account_id"
    )
    .eq("id", payment_id)
    .single();

  if (error || !payment) {
    throw new Error(error?.message ?? "Payment voucher not found.");
  }

  await requireCompanyRole(user.id, payment.company_id, ["Admin", "Manager"]);

  if (payment.status !== "approved") {
    throw new Error("Only approved payment vouchers can be posted.");
  }

  const accounts = await getCompanyAccounts(payment.company_id);
  if (!accounts?.ap_control_account_id) {
    throw new Error("AP control account is not configured.");
  }

  if (Number(payment.wht_deducted) > 0 && !accounts?.wht_payable_account_id) {
    throw new Error("WHT payable account is not configured.");
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ap_payment_allocations")
    .select("amount")
    .eq("payment_voucher_id", payment_id);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const totalAllocated = round2(
    (allocations ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];

  journalLines.push({
    account_id: accounts.ap_control_account_id,
    debit: totalAllocated,
    credit: 0,
  });

  journalLines.push({
    account_id: payment.cash_account_id,
    debit: 0,
    credit: Number(payment.total_paid) || 0,
  });

  if (Number(payment.wht_deducted) > 0 && accounts?.wht_payable_account_id) {
    journalLines.push({
      account_id: accounts.wht_payable_account_id,
      debit: 0,
      credit: Number(payment.wht_deducted) || 0,
    });
  }

  const journalId = await createPostedJournal(
    payment.company_id,
    payment.period_id,
    payment.payment_date,
    payment.narration ?? "Payment voucher",
    user.id,
    journalLines
  );

  await supabaseAdmin().from("doc_journals").insert({
    company_id: payment.company_id,
    doc_type: "payment_voucher",
    doc_id: payment.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("ap_payment_vouchers")
    .update({
      status: "posted",
      posted_by: user.id,
      posted_at: new Date().toISOString(),
    })
    .eq("id", payment_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

export const getArReconciliation = async (companyId: string) => {
  const { data: invoices, error: invError } = await supabaseAdmin()
    .from("ar_invoices")
    .select("total_gross")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (invError) {
    throw new Error(invError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ar_receipt_allocations")
    .select("amount, ar_receipts!inner(status)")
    .eq("ar_receipts.status", "posted")
    .eq("ar_receipts.company_id", companyId);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const invoiceTotal = round2(
    (invoices ?? []).reduce((sum, row) => sum + Number(row.total_gross || 0), 0)
  );
  const receiptTotal = round2(
    (allocations ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  return {
    invoiceTotal,
    receiptTotal,
    difference: round2(invoiceTotal - receiptTotal),
  };
};

export const getApReconciliation = async (companyId: string) => {
  const { data: bills, error: billError } = await supabaseAdmin()
    .from("ap_bills")
    .select("total_gross")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (billError) {
    throw new Error(billError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ap_payment_allocations")
    .select("amount, ap_payment_vouchers!inner(status)")
    .eq("ap_payment_vouchers.status", "posted")
    .eq("ap_payment_vouchers.company_id", companyId);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const billTotal = round2(
    (bills ?? []).reduce((sum, row) => sum + Number(row.total_gross || 0), 0)
  );
  const paymentTotal = round2(
    (allocations ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  return {
    billTotal,
    paymentTotal,
    difference: round2(billTotal - paymentTotal),
  };
};
