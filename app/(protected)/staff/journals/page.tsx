import { revalidatePath } from "next/cache";

import JournalEntryForm from "@/components/journal-entry-form";
import { Badge } from "@/components/ui/badge";
import ApproveButton from "@/components/approve-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approveJournal, createJournalDraft, postJournal, reverseJournal } from "@/lib/actions/journals";
import { ensureActiveCompanyId, getUserCompanyRoles, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function JournalsPage() {
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/journals");

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);

  const roles = await getUserCompanyRoles(user.id);
  const canApprove = roles.some(
    (role) => role.company_id === companyId && ["Admin", "Manager"].includes(role.role)
  );

  const { data: accounts, error: accountError } = await supabaseAdmin()
    .from("accounts")
    .select("id, code, name")
    .eq("company_id", companyId)
    .order("code", { ascending: true });

  if (accountError) {
    throw new Error(accountError.message);
  }

  const { data: periods, error: periodError } = await supabaseAdmin()
    .from("periods")
    .select("id, period_month, period_year, start_date, end_date")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });

  if (periodError) {
    throw new Error(periodError.message);
  }

  const { data: journals, error: journalError } = await supabaseAdmin()
    .from("journal_entries")
    .select(
      "id, entry_date, narration, status, created_by, periods ( period_month, period_year )"
    )
    .eq("company_id", companyId)
    .order("entry_date", { ascending: false })
    .limit(50);

  if (journalError) {
    throw new Error(journalError.message);
  }

  async function createDraftAction(formData: FormData) {
    "use server";
    const company = String(formData.get("company_id") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const entryDate = String(formData.get("entry_date") ?? "");
    const narration = String(formData.get("narration") ?? "");
    const linesJson = String(formData.get("lines_json") ?? "[]");
    const lines = JSON.parse(linesJson) as Array<{
      account_id: string;
      debit: string;
      credit: string;
    }>;

    await createJournalDraft(
      company,
      periodId,
      entryDate,
      narration,
      lines.map((line) => ({
        account_id: line.account_id,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
      }))
    );

    revalidatePath("/staff/journals");
  }

  async function approveAction(formData: FormData) {
    "use server";
    const journalId = String(formData.get("journal_id") ?? "");
    await approveJournal(journalId);
    revalidatePath("/staff/journals");
  }

  async function postAction(formData: FormData) {
    "use server";
    const journalId = String(formData.get("journal_id") ?? "");
    await postJournal(journalId);
    revalidatePath("/staff/journals");
  }

  async function reverseAction(formData: FormData) {
    "use server";
    const journalId = String(formData.get("journal_id") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      throw new Error("Reversal reason is required.");
    }
    await reverseJournal(journalId, reason);
    revalidatePath("/staff/journals");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New journal draft</CardTitle>
          <CardDescription>Create a new journal for approval.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createDraftAction} className="space-y-4">
            <JournalEntryForm
              accounts={accounts ?? []}
              periods={(periods ?? []).map((period) => ({
                id: period.id,
                label: `${period.period_year}-${String(period.period_month).padStart(2, "0")}`,
              }))}
              companyId={companyId}
            />
            <Button type="submit">Save draft</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent journals</CardTitle>
          <CardDescription>Latest 50 entries for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(journals ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
                    No journals yet.
                  </TableCell>
                </TableRow>
              ) : (
                journals?.map((journal) => (
                  <TableRow key={journal.id}>
                    <TableCell>{journal.entry_date}</TableCell>
                    <TableCell>
                      {(() => {
                        const period = Array.isArray(journal.periods)
                          ? journal.periods[0]
                          : journal.periods;
                        return period
                          ? `${period.period_year}-${String(period.period_month).padStart(2, "0")}`
                          : "-";
                      })()}
                    </TableCell>
                    <TableCell>{journal.narration}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          journal.status === "posted"
                            ? "success"
                            : journal.status === "approved"
                            ? "warning"
                            : "default"
                        }
                      >
                        {journal.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-y-2">
                      {canApprove && journal.status === "draft" && (
                        <form action={approveAction}>
                          <input type="hidden" name="journal_id" value={journal.id} />
                          <ApproveButton />
                        </form>
                      )}
                      {canApprove && journal.status === "approved" && (
                        <form action={postAction}>
                          <input type="hidden" name="journal_id" value={journal.id} />
                          <Button type="submit">
                            Post
                          </Button>
                        </form>
                      )}
                      {canApprove && journal.status === "posted" && (
                        <form action={reverseAction} className="flex flex-col gap-2">
                          <input type="hidden" name="journal_id" value={journal.id} />
                          <Input name="reason" placeholder="Reversal reason" />
                          <Button type="submit" variant="outline">
                            Reverse
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
