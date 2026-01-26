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
  email?: string;
  phone?: string;
  address?: string;
  group_id?: string | null;
  tax_exempt?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("customers").insert({
    company_id: payload.company_id,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    group_id: payload.group_id ?? null,
    tax_exempt: payload.tax_exempt ?? false,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const updateCustomer = async (payload: {
  id: string;
  company_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  group_id?: string | null;
  tax_exempt?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("customers")
    .update({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      group_id: payload.group_id ?? null,
      tax_exempt: payload.tax_exempt ?? false,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
};

export const createSupplier = async (payload: {
  company_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  group_id?: string | null;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("suppliers").insert({
    company_id: payload.company_id,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    group_id: payload.group_id ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const updateSupplier = async (payload: {
  id: string;
  company_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  group_id?: string | null;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("suppliers")
    .update({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      group_id: payload.group_id ?? null,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
};

export const createTaxRate = async (payload: {
  company_id: string;
  name: string;
  tax_type: string;
  applies_to: string;
  rate: number;
  is_withholding: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("tax_rates").insert({
    company_id: payload.company_id,
    name: payload.name,
    tax_type: payload.tax_type,
    applies_to: payload.applies_to,
    rate: payload.rate,
    is_withholding: payload.is_withholding,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const mapTaxAccount = async (payload: {
  company_id: string;
  tax_rate_id: string;
  account_id: string;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("tax_accounts")
    .upsert({
      company_id: payload.company_id,
      tax_rate_id: payload.tax_rate_id,
      account_id: payload.account_id,
    });

  if (error) {
    throw new Error(error.message);
  }
};

export const upsertCompanyAccounts = async (payload: {
  company_id: string;
  ar_control_account_id?: string | null;
  ap_control_account_id?: string | null;
  wht_receivable_account_id?: string | null;
  wht_payable_account_id?: string | null;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("company_accounts")
    .upsert({
      company_id: payload.company_id,
      ar_control_account_id: payload.ar_control_account_id ?? null,
      ap_control_account_id: payload.ap_control_account_id ?? null,
      wht_receivable_account_id: payload.wht_receivable_account_id ?? null,
      wht_payable_account_id: payload.wht_payable_account_id ?? null,
    });

  if (error) {
    throw new Error(error.message);
  }
};