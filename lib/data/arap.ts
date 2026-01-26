import { supabaseAdmin } from "@/lib/supabase/admin";

const round2 = (value: number) => Math.round(value * 100) / 100;

type StatementEntry = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
};

export const getCustomerStatement = async (companyId: string, customerId: string) => {
  const { data: invoices, error: invError } = await supabaseAdmin()
    .from("invoices")
    .select("id, invoice_no, invoice_date, narration, total_gross")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .eq("status", "posted");

  if (invError) {
    throw new Error(invError.message);
  }

  const invoiceIds = (invoices ?? []).map((invoice) => invoice.id);
  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("receipt_allocations")
    .select("invoice_id, amount_allocated, receipts!inner(receipt_date, receipt_no, status)")
    .in(
      "invoice_id",
      invoiceIds.length > 0 ? invoiceIds : ["00000000-0000-0000-0000-000000000000"]
    )
    .eq("receipts.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const entries: StatementEntry[] = [];

  for (const invoice of invoices ?? []) {
    entries.push({
      date: invoice.invoice_date,
      description: invoice.narration ?? `Invoice ${invoice.invoice_no}`,
      debit: Number(invoice.total_gross) || 0,
      credit: 0,
    });
  }

  for (const allocation of allocations ?? []) {
    const receiptValue = allocation.receipts as
      | { receipt_date: string; receipt_no: string }
      | { receipt_date: string; receipt_no: string }[]
      | null;
    const receipt = Array.isArray(receiptValue) ? receiptValue[0] : receiptValue;
    if (!receipt) continue;
    entries.push({
      date: receipt.receipt_date,
      description: `Receipt ${receipt.receipt_no}`,
      debit: 0,
      credit: Number(allocation.amount_allocated) || 0,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  return entries.map((entry) => {
    running = round2(running + entry.debit - entry.credit);
    return { ...entry, balance: running };
  });
};

export const getSupplierStatement = async (companyId: string, supplierId: string) => {
  const { data: bills, error: billError } = await supabaseAdmin()
    .from("bills")
    .select("id, bill_no, bill_date, narration, total_gross")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .eq("status", "posted");

  if (billError) {
    throw new Error(billError.message);
  }

  const billIds = (bills ?? []).map((bill) => bill.id);
  const { data: allocations, error: allocError } = await supabaseAdmin()
    .from("payment_allocations")
    .select(
      "bill_id, amount_allocated, payment_vouchers!inner(payment_date, voucher_no, status)"
    )
    .in("bill_id", billIds.length > 0 ? billIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("payment_vouchers.status", "posted");

  if (allocError) {
    throw new Error(allocError.message);
  }

  const entries: StatementEntry[] = [];

  for (const bill of bills ?? []) {
    entries.push({
      date: bill.bill_date,
      description: bill.narration ?? `Bill ${bill.bill_no}`,
      debit: Number(bill.total_gross) || 0,
      credit: 0,
    });
  }

  for (const allocation of allocations ?? []) {
    const paymentValue = allocation.payment_vouchers as
      | { payment_date: string; voucher_no: string }
      | { payment_date: string; voucher_no: string }[]
      | null;
    const payment = Array.isArray(paymentValue) ? paymentValue[0] : paymentValue;
    if (!payment) continue;
    entries.push({
      date: payment.payment_date,
      description: `Payment ${payment.voucher_no}`,
      debit: 0,
      credit: Number(allocation.amount_allocated) || 0,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  return entries.map((entry) => {
    running = round2(running + entry.debit - entry.credit);
    return { ...entry, balance: running };
  });
};

export const getAgingBuckets = async (
  companyId: string,
  kind: "customers" | "suppliers"
) => {
  if (kind === "customers") {
    const { data: invoices, error } = await supabaseAdmin()
      .from("invoices")
      .select("id, customer_id, due_date, invoice_date, total_gross")
      .eq("company_id", companyId)
      .eq("status", "posted");

    if (error) {
      throw new Error(error.message);
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
        round2(
          (allocationTotals.get(alloc.invoice_id) ?? 0) +
            Number(alloc.amount_allocated || 0)
        )
      );
    }

    const today = new Date();
    const buckets: Record<
      string,
      { current: number; days30: number; days60: number; days90: number; days90plus: number }
    > = {};

    for (const invoice of invoices ?? []) {
      const outstanding = round2(
        Number(invoice.total_gross || 0) - (allocationTotals.get(invoice.id) ?? 0)
      );

      if (outstanding <= 0) continue;

      const dueDate = new Date(invoice.due_date ?? invoice.invoice_date);
      const diffDays = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
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
    .from("bills")
    .select("id, supplier_id, due_date, bill_date, total_gross")
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
      round2(
        (allocationTotals.get(alloc.bill_id) ?? 0) + Number(alloc.amount_allocated || 0)
      )
    );
  }

  const today = new Date();
  const buckets: Record<
    string,
    { current: number; days30: number; days60: number; days90: number; days90plus: number }
  > = {};

  for (const bill of bills ?? []) {
    const outstanding = round2(
      Number(bill.total_gross || 0) - (allocationTotals.get(bill.id) ?? 0)
    );

    if (outstanding <= 0) continue;

    const dueDate = new Date(bill.due_date ?? bill.bill_date);
    const diffDays = Math.floor(
      (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
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
