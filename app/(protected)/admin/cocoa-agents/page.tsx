import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCocoaAgent, updateCocoaAgent } from "@/lib/actions/ctro-admin";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function CocoaAgentsPage() {
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/admin/cocoa-agents");

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cocoa Agents</CardTitle>
          <CardDescription>No company access yet. Please contact Admin.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);
  const activeCompanyId = companyId as string;

  const { data: agents, error } = await supabaseAdmin()
    .from("cocoa_agents")
    .select("id, name, role_type, district, phone, is_active")
    .eq("company_id", companyId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  async function createAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const roleType = String(formData.get("role_type") ?? "Agent").trim();
    const district = String(formData.get("district") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const isActive = Boolean(formData.get("is_active"));

    if (!name) {
      throw new Error("Agent name is required.");
    }

    await createCocoaAgent({
      company_id: activeCompanyId,
      name,
      role_type: roleType,
      district: district || null,
      phone: phone || null,
      is_active: isActive,
    });

    revalidatePath("/admin/cocoa-agents");
  }

  async function updateAction(formData: FormData) {
    "use server";
    const id = String(formData.get("agent_id") ?? "");
    const name = String(formData.get("edit_name") ?? "").trim();
    const roleType = String(formData.get("edit_role_type") ?? "Agent").trim();
    const district = String(formData.get("edit_district") ?? "").trim();
    const phone = String(formData.get("edit_phone") ?? "").trim();
    const isActive = Boolean(formData.get("edit_is_active"));

    if (!id || !name) {
      throw new Error("Agent and name are required.");
    }

    await updateCocoaAgent({
      id,
      company_id: activeCompanyId,
      name,
      role_type: roleType,
      district: district || null,
      phone: phone || null,
      is_active: isActive,
    });

    revalidatePath("/admin/cocoa-agents");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cocoa agents</CardTitle>
          <CardDescription>Manage depot keepers, PCs, and DMs.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(agents ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No cocoa agents yet.
                  </TableCell>
                </TableRow>
              ) : (
                agents?.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>{agent.name}</TableCell>
                    <TableCell>{agent.role_type}</TableCell>
                    <TableCell>{agent.district ?? "-"}</TableCell>
                    <TableCell>{agent.phone ?? "-"}</TableCell>
                    <TableCell>{agent.is_active ? "Active" : "Inactive"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add cocoa agent</CardTitle>
          <CardDescription>Register a new cocoa agent.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role_type">Role</Label>
              <Input id="role_type" name="role_type" defaultValue="Agent" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Input id="district" name="district" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="is_active" defaultChecked /> Active
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Create agent</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit cocoa agent</CardTitle>
          <CardDescription>Update existing agent details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent_id">Agent</Label>
              <Select id="agent_id" name="agent_id" required>
                <option value="">Select agent</option>
                {(agents ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_name">Name</Label>
              <Input id="edit_name" name="edit_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_role_type">Role</Label>
              <Input id="edit_role_type" name="edit_role_type" defaultValue="Agent" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_district">District</Label>
              <Input id="edit_district" name="edit_district" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input id="edit_phone" name="edit_phone" />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="edit_is_active" defaultChecked /> Active
            </label>
            <div className="md:col-span-2">
              <Button type="submit" variant="outline">
                Update agent
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
