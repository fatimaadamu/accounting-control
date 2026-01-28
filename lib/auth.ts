import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserCompanyRole = {
  company_id: string;
  role: "Admin" | "AccountsOfficer" | "Manager" | "Director" | "Auditor";
};

export type CompanySummary = {
  id: string;
  name: string;
  base_currency: string;
};

export const getActiveCompanyId = async () => {
  const cookieStore = await cookies();
  return cookieStore.get("activeCompanyId")?.value ?? null;
};

export const ensureActiveCompanyId = async (userId: string, nextPath: string) => {
  const activeCompanyId = await getActiveCompanyId();
  const companies = await getUserCompanies(userId);
  if (companies.length === 0) {
    return null;
  }

  const hasActive = companies.some((company) => company.id === activeCompanyId);
  if (activeCompanyId && hasActive) {
    return activeCompanyId;
  }

  const defaultCompanyId = companies[0].id;
  redirect(
    `/api/company/default?company_id=${defaultCompanyId}&next=${encodeURIComponent(nextPath)}`
  );
};

export const getAuthenticatedUser = async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }
  return data.user ?? null;
};

export const requireUser = async () => {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }
  return user;
};

export const getUserCompanyRoles = async (userId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("user_company_roles")
    .select("company_id, role")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserCompanyRole[];
};

export const requireCompanyAccess = async (
  userId: string,
  companyId: string
) => {
  const roles = await getUserCompanyRoles(userId);
  const companyRoles = roles.filter((role) => role.company_id === companyId);
  if (companyRoles.length === 0) {
    throw new Error("User does not have access to this company.");
  }
  return companyRoles;
};

export const requireCompanyRole = async (
  userId: string,
  companyId: string,
  allowed: UserCompanyRole["role"][]
) => {
  const roles = await requireCompanyAccess(userId, companyId);
  const hasRole = roles.some((role) => allowed.includes(role.role));
  if (!hasRole) {
    throw new Error("User does not have permission for this action.");
  }
};

export const getUserCompanies = async (userId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("user_company_roles")
    .select("company_id, companies ( id, name, base_currency )")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const companyMap = new Map<string, CompanySummary>();
  for (const row of data ?? []) {
    const companyValue = row.companies as CompanySummary | CompanySummary[] | null;
    const company = Array.isArray(companyValue) ? companyValue[0] : companyValue;
    if (company && !companyMap.has(company.id)) {
      companyMap.set(company.id, company);
    }
  }

  return Array.from(companyMap.values());
};
