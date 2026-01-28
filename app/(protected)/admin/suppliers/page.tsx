import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupplier, updateSupplier } from "@/lib/actions/arap-admin";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function SuppliersPage() {
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/admin/suppliers");

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>No companies assigned. Ask an admin to grant access.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);
  const activeCompanyId = companyId as string;

  const { data: suppliers, error } = await supabaseAdmin()
    .from("suppliers")
    .select("id, name, wht_applicable, supplier_group_id")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const { data: groups, error: groupError } = await supabaseAdmin()
    .from("supplier_groups")
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
    const whtApplicable = Boolean(formData.get("wht_applicable"));

    if (!name) {
      throw new Error("Supplier name is required.");
    }

    await createSupplier({
      company_id: activeCompanyId,
      name,
      supplier_group_id: groupId || null,
      wht_applicable: whtApplicable,
    });

    revalidatePath("/admin/suppliers");
  }

  async function updateAction(formData: FormData) {
    "use server";
    const id = String(formData.get("supplier_id") ?? "");
    const name = String(formData.get("edit_name") ?? "").trim();
    const groupId = String(formData.get("edit_group_id") ?? "");
    const whtApplicable = Boolean(formData.get("edit_wht_applicable"));

    if (!id || !name) {
      throw new Error("Supplier and name are required.");
    }

    await updateSupplier({
      id,
      company_id: activeCompanyId,
      name,
      supplier_group_id: groupId || null,
      wht_applicable: whtApplicable,
    });

    revalidatePath("/admin/suppliers");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>Manage supplier records for AP documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WHT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(suppliers ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-sm text-zinc-500">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers?.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>{supplier.name}</TableCell>
                    <TableCell>{supplier.wht_applicable ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add supplier</CardTitle>
          <CardDescription>Basic setup for AP documents.</CardDescription>
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
              <input type="checkbox" name="wht_applicable" defaultChecked /> WHT applicable
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Create supplier</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit supplier</CardTitle>
          <CardDescription>Update basic supplier details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplier_id">Supplier</Label>
              <Select id="supplier_id" name="supplier_id" required>
                <option value="">Select supplier</option>
                {(suppliers ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
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
              <input type="checkbox" name="edit_wht_applicable" defaultChecked /> WHT applicable
            </label>
            <div className="md:col-span-2">
              <Button type="submit" variant="outline">
                Update supplier
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
