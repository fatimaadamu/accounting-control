import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ROLE_OPTIONS = ["Admin", "Manager", "AccountsOfficer", "Director", "Auditor"] as const;
const PAGE_SIZE = 50;

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ email?: string; page?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const searchValue = String(resolvedSearchParams?.email ?? "").trim();
  const currentPage = Math.max(1, Number(resolvedSearchParams?.page ?? "1") || 1);

  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/admin/users");

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>No companies assigned. Ask an admin to grant access.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);

  const { data: accessRows, error: accessError } = await supabaseAdmin()
    .from("user_company_roles")
    .select("user_id, company_id, role, created_at")
    .order("created_at", { ascending: false });

  if (accessError) {
    throw new Error(accessError.message);
  }

  const summaryMap = new Map<
    string,
    { user_id: string; roleCount: number; companyIds: Set<string>; lastUpdated: string }
  >();

  for (const row of accessRows ?? []) {
    const key = String(row.user_id);
    const existing = summaryMap.get(key);
    if (!existing) {
      summaryMap.set(key, {
        user_id: key,
        roleCount: 1,
        companyIds: new Set([String(row.company_id)]),
        lastUpdated: String(row.created_at),
      });
    } else {
      existing.roleCount += 1;
      existing.companyIds.add(String(row.company_id));
      if (String(row.created_at) > existing.lastUpdated) {
        existing.lastUpdated = String(row.created_at);
      }
    }
  }

  const summaries = Array.from(summaryMap.values()).sort((a, b) =>
    b.lastUpdated.localeCompare(a.lastUpdated)
  );
  const totalPages = Math.max(1, Math.ceil(summaries.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pagedSummaries = summaries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const emailCache = new Map<string, string | null>();
  const resolveEmail = async (userId: string) => {
    if (emailCache.has(userId)) {
      return emailCache.get(userId) ?? null;
    }
    const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId);
    if (error || !data?.user?.email) {
      emailCache.set(userId, null);
      return null;
    }
    emailCache.set(userId, data.user.email);
    return data.user.email;
  };

  const emails = new Map<string, string | null>();
  await Promise.all(
    pagedSummaries.map(async (entry) => {
      const email = await resolveEmail(entry.user_id);
      emails.set(entry.user_id, email);
    })
  );

  let lookupUser: { id: string; email: string | null } | null = null;
  let lookupMessage = "";

  if (searchValue) {
    const normalized = searchValue.trim().toLowerCase();
    if (isUuid(searchValue)) {
      const { data, error } = await supabaseAdmin().auth.admin.getUserById(searchValue);
      if (!error && data?.user) {
        lookupUser = { id: data.user.id, email: data.user.email ?? null };
      }
    } else {
      for (let pageIndex = 1; pageIndex <= 2; pageIndex += 1) {
        const { data, error } = await supabaseAdmin().auth.admin.listUsers({
          page: pageIndex,
          perPage: 1000,
        });
        if (error) {
          break;
        }
        const match = data?.users?.find(
          (item) => item.email?.toLowerCase() === normalized
        );
        if (match) {
          lookupUser = { id: match.id, email: match.email ?? null };
          break;
        }
        if (!data?.users?.length) {
          break;
        }
      }
    }

    if (!lookupUser) {
      lookupMessage = "User not found in this Supabase project";
    }
  }

  const { data: companies, error: companyError } = await supabaseAdmin()
    .from("companies")
    .select("id, name")
    .order("name");

  if (companyError) {
    throw new Error(companyError.message);
  }

  const { data: userRoles, error: rolesError } = lookupUser
    ? await supabaseAdmin()
        .from("user_company_roles")
        .select("company_id, role, companies ( id, name )")
        .eq("user_id", lookupUser.id)
    : { data: [], error: null };

  if (rolesError) {
    throw new Error(rolesError.message);
  }

  async function findUserAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) {
      redirect("/admin/users");
    }
    redirect(`/admin/users?email=${encodeURIComponent(email)}`);
  }

  async function grantRoleAction(formData: FormData) {
    "use server";
    const targetUserId = String(formData.get("target_user_id") ?? "");
    const targetCompanyId = String(formData.get("company_id") ?? "");
    const role = String(formData.get("role") ?? "");

    const currentUser = await requireUser();
    const activeCompanyId = await ensureActiveCompanyId(currentUser.id, "/admin/users");
    if (!activeCompanyId) {
      throw new Error("Active company is required.");
    }
    await requireCompanyRole(currentUser.id, activeCompanyId, ["Admin"]);

    if (!targetUserId || !targetCompanyId || !ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number])) {
      throw new Error("User, company, and role are required.");
    }

    const { error } = await supabaseAdmin()
      .from("user_company_roles")
      .upsert(
        {
          user_id: targetUserId,
          company_id: targetCompanyId,
          role,
        },
        { onConflict: "user_id,company_id,role", ignoreDuplicates: true }
      );

    if (error) {
      throw new Error(error.message);
    }

    await supabaseAdmin().from("audit_logs").insert({
      company_id: targetCompanyId,
      entity: "user_company_roles",
      entity_id: `${targetUserId}:${targetCompanyId}:${role}`,
      action: "ROLE_GRANTED",
      created_by: currentUser.id,
      after: { user_id: targetUserId, company_id: targetCompanyId, role },
    });

    revalidatePath("/admin/users");
  }

  async function revokeRoleAction(formData: FormData) {
    "use server";
    const targetUserId = String(formData.get("target_user_id") ?? "");
    const targetCompanyId = String(formData.get("company_id") ?? "");
    const role = String(formData.get("role") ?? "");

    const currentUser = await requireUser();
    const activeCompanyId = await ensureActiveCompanyId(currentUser.id, "/admin/users");
    if (!activeCompanyId) {
      throw new Error("Active company is required.");
    }
    await requireCompanyRole(currentUser.id, activeCompanyId, ["Admin"]);

    if (!targetUserId || !targetCompanyId || !role) {
      throw new Error("Role selection is required.");
    }

    if (targetUserId === currentUser.id && role === "Admin") {
      const { data: adminRoles, error } = await supabaseAdmin()
        .from("user_company_roles")
        .select("company_id")
        .eq("user_id", currentUser.id)
        .eq("role", "Admin");

      if (error) {
        throw new Error(error.message);
      }

      if ((adminRoles ?? []).length <= 1) {
        throw new Error("You cannot remove your last Admin role.");
      }
    }

    const { error } = await supabaseAdmin()
      .from("user_company_roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("company_id", targetCompanyId)
      .eq("role", role);

    if (error) {
      throw new Error(error.message);
    }

    await supabaseAdmin().from("audit_logs").insert({
      company_id: targetCompanyId,
      entity: "user_company_roles",
      entity_id: `${targetUserId}:${targetCompanyId}:${role}`,
      action: "ROLE_REVOKED",
      created_by: currentUser.id,
      before: { user_id: targetUserId, company_id: targetCompanyId, role },
    });

    revalidatePath("/admin/users");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Users with access</CardTitle>
          <CardDescription>Users that already have company roles assigned.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Companies</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                pagedSummaries.map((entry) => (
                  <TableRow key={entry.user_id}>
                    <TableCell>
                      <div className="text-sm font-medium text-zinc-900">{entry.user_id}</div>
                      <div className="text-xs text-zinc-500">
                        {emails.get(entry.user_id) ?? "(email unavailable)"}
                      </div>
                    </TableCell>
                    <TableCell>{entry.roleCount}</TableCell>
                    <TableCell>{entry.companyIds.size}</TableCell>
                    <TableCell>{new Date(entry.lastUpdated).toLocaleString()}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/users?email=${encodeURIComponent(entry.user_id)}`}
                        className="inline-flex items-center rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                      >
                        Manage
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-600">
              <div>
                Page {page} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={`/admin/users?page=${page - 1}`}
                    className="rounded-md border border-zinc-200 px-3 py-1"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded-md border border-zinc-100 px-3 py-1 text-zinc-400">Previous</span>
                )}
                {page < totalPages ? (
                  <Link
                    href={`/admin/users?page=${page + 1}`}
                    className="rounded-md border border-zinc-200 px-3 py-1"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-md border border-zinc-100 px-3 py-1 text-zinc-400">Next</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Find user</CardTitle>
            <CardDescription>Search by email or user UUID.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={findUserAction} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email / User ID</Label>
                <Input id="email" name="email" defaultValue={searchValue} />
              </div>
              <Button type="submit" variant="outline">
                Find user
              </Button>
            </form>
            {lookupMessage && <p className="mt-3 text-sm text-zinc-500">{lookupMessage}</p>}
            {lookupUser && (
              <div className="mt-4 space-y-1 text-sm text-zinc-600">
                <div className="font-medium text-zinc-900">{lookupUser.email ?? "(email unavailable)"}</div>
                <div>User ID: {lookupUser.id}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grant access</CardTitle>
            <CardDescription>Assign a role for a company.</CardDescription>
          </CardHeader>
          <CardContent>
            {!lookupUser ? (
              <p className="text-sm text-zinc-500">Find a user to grant access.</p>
            ) : (
              <form action={grantRoleAction} className="space-y-3">
                <input type="hidden" name="target_user_id" value={lookupUser.id} />
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Select name="company_id" required>
                    <option value="">Select company</option>
                    {companies?.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select name="role" required>
                    <option value="">Select role</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit">Grant role</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current roles</CardTitle>
            <CardDescription>Manage company roles for this user.</CardDescription>
          </CardHeader>
          <CardContent>
            {!lookupUser ? (
              <p className="text-sm text-zinc-500">Find a user to view roles.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(userRoles ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-zinc-500">
                        No roles assigned yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (userRoles ?? []).map((roleEntry) => {
                      const companyInfo = Array.isArray(roleEntry.companies)
                        ? roleEntry.companies[0]
                        : roleEntry.companies;
                      return (
                        <TableRow key={`${roleEntry.company_id}-${roleEntry.role}`}>
                          <TableCell>{companyInfo?.name ?? roleEntry.company_id}</TableCell>
                          <TableCell>{roleEntry.role}</TableCell>
                          <TableCell>
                            <form action={revokeRoleAction}>
                              <input type="hidden" name="target_user_id" value={lookupUser.id} />
                              <input type="hidden" name="company_id" value={roleEntry.company_id} />
                              <input type="hidden" name="role" value={roleEntry.role} />
                              <Button type="submit" variant="ghost">
                                Revoke
                              </Button>
                            </form>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
