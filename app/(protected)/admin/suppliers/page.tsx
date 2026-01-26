import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupplier, updateSupplier } from "@/lib/actions/arap-admin";
import { getActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function SuppliersPage() {
  const user = await requireUser();
  const companyId = await getActiveCompanyId();

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Suppliers</CardTitle>
          <CardDescription>Select a company to continue.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);
  const activeCompanyId = companyId as string;

  const { data: suppliers, error } = await supabaseAdmin()
    .from("suppliers")
    .select("id, name, email, phone, group_id")
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
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const groupId = String(formData.get("group_id") ?? "");

    if (!name) {
      throw new Error("Supplier name is required.");
    }

    await createSupplier({
      company_id: activeCompanyId,
      name,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      group_id: groupId || null,
    });

    revalidatePath("/admin/suppliers");
  }

  async function updateAction(formData: FormData) {
    "use server";
    const id = String(formData.get("supplier_id") ?? "");
    const name = String(formData.get("edit_name") ?? "").trim();
    const email = String(formData.get("edit_email") ?? "").trim();
    const phone = String(formData.get("edit_phone") ?? "").trim();
    const address = String(formData.get("edit_address") ?? "").trim();
    const groupId = String(formData.get("edit_group_id") ?? "");

    if (!id || !name) {
      throw new Error("Supplier and name are required.");
    }

    await updateSupplier({
      id,
      company_id: activeCompanyId,
      name,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      group_id: groupId || null,
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
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(suppliers ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-zinc-500">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers?.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>{supplier.name}</TableCell>
                    <TableCell>{supplier.email ?? "-"}</TableCell>
                    <TableCell>{supplier.phone ?? "-"}</TableCell>
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
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input id="edit_email" name="edit_email" type="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input id="edit_phone" name="edit_phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_address">Address</Label>
              <Input id="edit_address" name="edit_address" />
            </div>
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
