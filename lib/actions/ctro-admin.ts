"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyRole, requireUser } from "@/lib/auth";

export const createCocoaAgent = async (payload: {
  company_id: string;
  name: string;
  role_type: string;
  district?: string | null;
  phone?: string | null;
  is_active?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("cocoa_agents").insert({
    company_id: payload.company_id,
    name: payload.name,
    role_type: payload.role_type,
    district: payload.district ?? null,
    phone: payload.phone ?? null,
    is_active: payload.is_active ?? true,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const updateCocoaAgent = async (payload: {
  id: string;
  company_id: string;
  name: string;
  role_type: string;
  district?: string | null;
  phone?: string | null;
  is_active?: boolean;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin()
    .from("cocoa_agents")
    .update({
      name: payload.name,
      role_type: payload.role_type,
      district: payload.district ?? null,
      phone: payload.phone ?? null,
      is_active: payload.is_active ?? true,
    })
    .eq("id", payload.id);

  if (error) {
    throw new Error(error.message);
  }
};

export const upsertCtroAccounts = async (payload: {
  company_id: string;
  cocoa_stock_field_account_id?: string | null;
  cocoa_stock_evacuation_account_id?: string | null;
  cocoa_stock_margin_account_id?: string | null;
  advances_to_agents_account_id?: string | null;
  buyers_margin_income_account_id?: string | null;
  evacuation_payable_account_id?: string | null;
}) => {
  const user = await requireUser();
  await requireCompanyRole(user.id, payload.company_id, ["Admin"]);

  const { error } = await supabaseAdmin().from("ctro_accounts").upsert({
    company_id: payload.company_id,
    cocoa_stock_field_account_id: payload.cocoa_stock_field_account_id ?? null,
    cocoa_stock_evacuation_account_id: payload.cocoa_stock_evacuation_account_id ?? null,
    cocoa_stock_margin_account_id: payload.cocoa_stock_margin_account_id ?? null,
    advances_to_agents_account_id: payload.advances_to_agents_account_id ?? null,
    buyers_margin_income_account_id: payload.buyers_margin_income_account_id ?? null,
    evacuation_payable_account_id: payload.evacuation_payable_account_id ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
};
