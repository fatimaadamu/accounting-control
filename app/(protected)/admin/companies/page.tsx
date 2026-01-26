import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCompany } from "@/lib/actions/admin";
import { getUserCompanies, getUserCompanyRoles, requireUser } from "@/lib/auth";

export default async function CompaniesPage() {
  const user = await requireUser();
  const roles = await getUserCompanyRoles(user.id);
  const isAdminSomewhere = roles.some((role) => role.role === "Admin");
  const companies = await getUserCompanies(user.id);

  async function createCompanyAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const baseCurrency = String(formData.get("base_currency") ?? "").trim();
    const fyStartMonth = Number(formData.get("fy_start_month") ?? 10);

    if (!name) {
      throw new Error("Company name is required.");
    }

    await createCompany(name, baseCurrency || "GHS", fyStartMonth || 10);
    revalidatePath("/admin/companies");
  }

  if (!isAdminSomewhere) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>Admin access required.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600">
            You need an Admin role to manage companies.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>Manage the companies you have access to.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Base currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-sm text-zinc-500">
                    No companies found.
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>{company.name}</TableCell>
                    <TableCell>{company.base_currency}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create company</CardTitle>
          <CardDescription>Invite finance users after creation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createCompanyAction} className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="name">Company name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="base_currency">Base currency</Label>
              <Input id="base_currency" name="base_currency" defaultValue="GHS" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fy_start_month">FY start month</Label>
              <Input
                id="fy_start_month"
                name="fy_start_month"
                type="number"
                min={1}
                max={12}
                defaultValue={10}
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit">Create company</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}