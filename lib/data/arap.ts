import { supabaseAdmin } from "@/lib/supabase/admin";

const round2 = (value: number) => Math.round(value * 100) / 100;

export const getCustomerStatement = async (companyId: string, customerId: string) => {
  const { data: invoices, error: invError } = await supabaseAdmin()
    .from("ar_invoices")
    .select("id, invoice_date, narration, total_gross")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .eq("status", "posted");

  if (invError) {
    throw new Error(invError.message);
  }

  const invoiceIds = (invoices ?? []).map((invoice) => invoice.id);
  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ar_receipt_allocations")
    .select("amount, ar_receipts!inner(receipt_date, status)")
    .in("invoice_id", invoiceIds.length > 0 ? invoiceIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("ar_receipts.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const entries: Array<{
    date: string;
    description: string;
    debit: number;
    credit: number;
  }> = [];

  for (const invoice of invoices ?? []) {
    entries.push({
      date: invoice.invoice_date,
      description: invoice.narration ?? "Invoice",
      debit: Number(invoice.total_gross) || 0,
      credit: 0,
    });
  }

  for (const allocation of allocations ?? []) {
    const receiptValue = allocation.ar_receipts as
      | { receipt_date: string }
      | { receipt_date: string }[]
      | null;
    const receipt = Array.isArray(receiptValue) ? receiptValue[0] : receiptValue;
    if (!receipt) continue;
    entries.push({
      date: receipt.receipt_date,
      description: "Receipt",
      debit: 0,
      credit: Number(allocation.amount) || 0,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  const detailed = entries.map((entry) => {
    running = round2(running + entry.debit - entry.credit);
    return { ...entry, balance: running };
  });

  return detailed;
};

export const getSupplierStatement = async (companyId: string, supplierId: string) => {
  const { data: bills, error: billError } = await supabaseAdmin()
    .from("ap_bills")
    .select("id, bill_date, narration, total_gross")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .eq("status", "posted");

  if (billError) {
    throw new Error(billError.message);
  }

  const billIds = (bills ?? []).map((bill) => bill.id);
  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ap_payment_allocations")
    .select("amount, ap_payment_vouchers!inner(payment_date, status)")
    .in("bill_id", billIds.length > 0 ? billIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("ap_payment_vouchers.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const entries: Array<{
    date: string;
    description: string;
    debit: number;
    credit: number;
  }> = [];

  for (const bill of bills ?? []) {
    entries.push({
      date: bill.bill_date,
      description: bill.narration ?? "Bill",
      debit: Number(bill.total_gross) || 0,
      credit: 0,
    });
  }

  for (const allocation of allocations ?? []) {
    const paymentValue = allocation.ap_payment_vouchers as
      | { payment_date: string }
      | { payment_date: string }[]
      | null;
    const payment = Array.isArray(paymentValue) ? paymentValue[0] : paymentValue;
    if (!payment) continue;
    entries.push({
      date: payment.payment_date,
      description: "Payment",
      debit: 0,
      credit: Number(allocation.amount) || 0,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  const detailed = entries.map((entry) => {
    running = round2(running + entry.debit - entry.credit);
    return { ...entry, balance: running };
  });

  return detailed;
};

export const getAgingBuckets = async (companyId: string, kind: "customers" | "suppliers") => {
  if (kind === "customers") {
    const { data: invoices, error } = await supabaseAdmin()
      .from("ar_invoices")
      .select("id, customer_id, due_date, total_gross")
      .eq("company_id", companyId)
      .eq("status", "posted");

    if (error) {
      throw new Error(error.message);
    }

    const { data: allocations, error: allocError } = await supabaseAdmin()
      .from("ar_receipt_allocations")
      .select("invoice_id, amount, ar_receipts!inner(status, company_id)")
      .eq("ar_receipts.status", "posted")
      .eq("ar_receipts.company_id", companyId);

    if (allocError) {
      throw new Error(allocError.message);
    }

    const allocationTotals = new Map<string, number>();
    for (const alloc of allocations ?? []) {
      allocationTotals.set(
        alloc.invoice_id,
        round2((allocationTotals.get(alloc.invoice_id) ?? 0) + Number(alloc.amount || 0))
      );
    }

    const today = new Date();
    const buckets: Record<string, { current: number; days30: number; days60: number; days90: number; days90plus: number }> = {};

    for (const invoice of invoices ?? []) {
      const outstanding = round2(
        Number(invoice.total_gross || 0) - (allocationTotals.get(invoice.id) ?? 0)
      );

      if (outstanding <= 0) continue;

      const dueDate = new Date(invoice.due_date);
      const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const key = invoice.customer_id;
      if (!buckets[key]) {
        buckets[key] = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };
      }

      if (diffDays <= 0) buckets[key].current += outstanding;
      else if (diffDays <= 30) buckets[key].days30 += outstanding;
      else if (diffDays <= 60) buckets[key].days60 += outstanding;
      else if (diffDays <= 90) buckets[key].days90 += outstanding;
      else buckets[key].days90plus += outstanding;
    }

    return buckets;
  }

  const { data: bills, error: billError } = await supabaseAdmin()
    .from("ap_bills")
    .select("id, supplier_id, due_date, total_gross")
    .eq("company_id", companyId)
    .eq("status", "posted");

  if (billError) {
    throw new Error(billError.message);
  }

  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("ap_payment_allocations")
    .select("bill_id, amount, ap_payment_vouchers!inner(status, company_id)")
    .eq("ap_payment_vouchers.status", "posted")
    .eq("ap_payment_vouchers.company_id", companyId);

  if (allocError) {
    throw new Error(allocError.message);
  }

  const allocationTotals = new Map<string, number>();
  for (const alloc of allocations ?? []) {
    allocationTotals.set(
      alloc.bill_id,
      round2((allocationTotals.get(alloc.bill_id) ?? 0) + Number(alloc.amount || 0))
    );
  }

  const today = new Date();
  const buckets: Record<string, { current: number; days30: number; days60: number; days90: number; days90plus: number }> = {};

  for (const bill of bills ?? []) {
    const outstanding = round2(
      Number(bill.total_gross || 0) - (allocationTotals.get(bill.id) ?? 0)
    );

    if (outstanding <= 0) continue;

    const dueDate = new Date(bill.due_date);
    const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const key = bill.supplier_id;
    if (!buckets[key]) {
      buckets[key] = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };
    }

    if (diffDays <= 0) buckets[key].current += outstanding;
    else if (diffDays <= 30) buckets[key].days30 += outstanding;
    else if (diffDays <= 60) buckets[key].days60 += outstanding;
    else if (diffDays <= 90) buckets[key].days90 += outstanding;
    else buckets[key].days90plus += outstanding;
  }

  return buckets;
};
