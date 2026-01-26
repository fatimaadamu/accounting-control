"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyRole, requireUser } from "@/lib/auth";

export const createCustomerGroup = async (companyId: string, name: string) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, companyId, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("customer_groups")
    .insert({ company_id: companyId, name });

  if (error) {
    throw new Error(error.message);
  }
};

export const createSupplierGroup = async (companyId: string, name: string) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, companyId, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("supplier_groups")
    .insert({ company_id: companyId, name });

  if (error) {
    throw new Error(error.message);
  }
};

export const createCustomer = async (payload: {
  company_id: string;
  name: string;
  customer_group_id?: string | null;
  tax_exempt?: boolean;
  wht_applicable?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("customers").insert({
    company_id: payload.company_id,
    name: payload.name,
    customer_group_id: payload.customer_group_id ?? null,
    tax_exempt: payload.tax_exempt ?? false,
    wht_applicable: payload.wht_applicable ?? true,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const updateCustomer = async (payload: {
  id: string;
  company_id: string;
  name: string;
  customer_group_id?: string | null;
  tax_exempt?: boolean;
  wht_applicable?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("customers")
    .update({
      name: payload.name,
      customer_group_id: payload.customer_group_id ?? null,
      tax_exempt: payload.tax_exempt ?? false,
      wht_applicable: payload.wht_applicable ?? true,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
};

export const createSupplier = async (payload: {
  company_id: string;
  name: string;
  supplier_group_id?: string | null;
  wht_applicable?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("suppliers")
    .insert({
      company_id: payload.company_id,
      name: payload.name,
      supplier_group_id: payload.supplier_group_id ?? null,
      wht_applicable: payload.wht_applicable ?? true,
    });

  if (error) {
    throw new Error(error.message);
  }
};

export const updateSupplier = async (payload: {
  id: string;
  company_id: string;
  name: string;
  supplier_group_id?: string | null;
  wht_applicable?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("suppliers")
    .update({
      name: payload.name,
      supplier_group_id: payload.supplier_group_id ?? null,
      wht_applicable: payload.wht_applicable ?? true,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
};

export const createTaxRate = async (payload: {
  company_id: string;
  tax: "VAT" | "NHIL" | "GETFund" | "WHT";
  rate: number;
  effective_from: string;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("tax_rates").insert({
    company_id: payload.company_id,
    tax: payload.tax,
    rate: payload.rate,
    effective_from: payload.effective_from,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const upsertTaxAccounts = async (payload: {
  company_id: string;
  vat_output_account_id?: string | null;
  nhil_output_account_id?: string | null;
  getfund_output_account_id?: string | null;
  wht_receivable_account_id?: string | null;
  wht_payable_account_id?: string | null;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("tax_accounts").upsert({
    company_id: payload.company_id,
    vat_output_account_id: payload.vat_output_account_id ?? null,
    nhil_output_account_id: payload.nhil_output_account_id ?? null,
    getfund_output_account_id: payload.getfund_output_account_id ?? null,
    wht_receivable_account_id: payload.wht_receivable_account_id ?? null,
    wht_payable_account_id: payload.wht_payable_account_id ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const upsertCompanyAccounts = async (payload: {
  company_id: string;
  ar_control_account_id?: string | null;
  ap_control_account_id?: string | null;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("company_accounts").upsert({
    company_id: payload.company_id,
    ar_control_account_id: payload.ar_control_account_id ?? null,
    ap_control_account_id: payload.ap_control_account_id ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
};
