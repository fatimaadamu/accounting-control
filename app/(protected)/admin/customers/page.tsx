import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCustomer, updateCustomer } from "@/lib/actions/arap-admin";
import { getActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function CustomersPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);
  const activeCompanyId = companyId as string;

  const { data: customers, error } = await supabaseAdmin()
    .from("customers")
    .select("id, name, tax_exempt, wht_applicable, customer_group_id")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const { data: groups, error: groupError } = await supabaseAdmin()
    .from("customer_groups")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (groupError) {
    throw new Error(groupError.message);
  }

  async function createAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const groupId = String(formData.get("group_id") ?? "");
    const taxExempt = Boolean(formData.get("tax_exempt"));
    const whtApplicable = Boolean(formData.get("wht_applicable"));

    if (!name) {
      throw new Error("Customer name is required.");
    }

    await createCustomer({
      company_id: activeCompanyId,
      name,
      customer_group_id: groupId || null,
      tax_exempt: taxExempt,
      wht_applicable: whtApplicable,
    });

    revalidatePath("/admin/customers");
  }

  async function updateAction(formData: FormData) {
    "use server";
    const id = String(formData.get("customer_id") ?? "");
    const name = String(formData.get("edit_name") ?? "").trim();
    const groupId = String(formData.get("edit_group_id") ?? "");
    const taxExempt = Boolean(formData.get("edit_tax_exempt"));
    const whtApplicable = Boolean(formData.get("edit_wht_applicable"));

    if (!id || !name) {
      throw new Error("Customer and name are required.");
    }

    await updateCustomer({
      id,
      company_id: activeCompanyId,
      name,
      customer_group_id: groupId || null,
      tax_exempt: taxExempt,
      wht_applicable: whtApplicable,
    });

    revalidatePath("/admin/customers");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>Manage customer records for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Tax exempt</TableHead>
                <TableHead>WHT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(customers ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-zinc-500">
                    No customers yet.
                  </TableCell>
                </TableRow>
              ) : (
                customers?.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>{customer.name}</TableCell>
                    <TableCell>{customer.tax_exempt ? "Yes" : "No"}</TableCell>
                    <TableCell>{customer.wht_applicable ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add customer</CardTitle>
          <CardDescription>Basic setup for AR documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group_id">Group</Label>
              <Select id="group_id" name="group_id">
                <option value="">None</option>
                {(groups ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="tax_exempt" /> Tax exempt
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="wht_applicable" defaultChecked /> WHT applicable
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Create customer</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit customer</CardTitle>
          <CardDescription>Update basic customer details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer_id">Customer</Label>
              <Select id="customer_id" name="customer_id" required>
                <option value="">Select customer</option>
                {(customers ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_group_id">Group</Label>
              <Select id="edit_group_id" name="edit_group_id">
                <option value="">None</option>
                {(groups ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_name">Name</Label>
              <Input id="edit_name" name="edit_name" required />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="edit_tax_exempt" /> Tax exempt
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="edit_wht_applicable" defaultChecked /> WHT applicable
            </label>
            <div className="md:col-span-2">
              <Button type="submit" variant="outline">
                Update customer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
