"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserCompanyRoles, requireUser } from "@/lib/auth";

export const createCompany = async (
  name: string,
  baseCurrency: string,
  fyStartMonth: number
) => {
  const user = await requireUser();
  const roles = await getUserCompanyRoles(user.id);
  const isAdminSomewhere = roles.some((role) => role.role === "Admin");
  if (!isAdminSomewhere) {
    throw new Error("Only Admin users can create companies.");
  }

  const { data: company, error } = await supabaseAdmin()
    .from("companies")
    .insert({ name, base_currency: baseCurrency, fy_start_month: fyStartMonth })
    .select("id, name, base_currency")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: roleError } = await supabaseAdmin()
    .from("user_company_roles")
    .insert({ user_id: user.id, company_id: company.id, role: "Admin" });

  if (roleError) {
    throw new Error(roleError.message);
  }

  return company;
};