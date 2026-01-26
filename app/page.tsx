import { redirect } from "next/navigation";

import { getActiveCompanyId, getUserCompanyRoles, requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  const roles = await getUserCompanyRoles(user.id);
  const activeCompanyId = await getActiveCompanyId();

  const isAdminForActiveCompany = roles.some(
    (role) => role.company_id === activeCompanyId && role.role === "Admin"
  );

  if (isAdminForActiveCompany) {
    redirect("/admin/companies");
  }

  redirect("/staff/journals");
}
