import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCustomerGroup } from "@/lib/actions/arap-admin";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function CustomerGroupsPage() {
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/admin/customer-groups");

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer groups</CardTitle>
          <CardDescription>No companies assigned. Ask an admin to grant access.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);

  const { data: groups, error } = await supabaseAdmin()
    .from("customer_groups")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const activeCompanyId = companyId as string;

  async function createAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      throw new Error("Group name is required.");
    }
    await createCustomerGroup(activeCompanyId, name);
    revalidatePath("/admin/customer-groups");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer groups</CardTitle>
          <CardDescription>Simple grouping for reporting.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groups ?? []).length === 0 ? (
                <TableRow>
                  <TableCell className="text-sm text-zinc-500">No groups yet.</TableCell>
                </TableRow>
              ) : (
                groups?.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>{group.name}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create group</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="flex items-end gap-3">
            <Input name="name" placeholder="Group name" />
            <Button type="submit">Add group</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
