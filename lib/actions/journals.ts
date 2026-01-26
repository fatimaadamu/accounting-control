"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  requireCompanyAccess,
  requireCompanyRole,
  requireUser,
} from "@/lib/auth";

type JournalLineInput = {
  account_id: string;
  debit: number;
  credit: number;
};

type AuditLogInput = {
  company_id: string;
  entity: string;
  entity_id: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  created_by: string;
};

const insertAuditLog = async (payload: AuditLogInput) => {
  const { error } = await supabaseAdmin().from("audit_logs").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
};

const normalizeLines = (lines: JournalLineInput[]) => {
  const filtered = lines
    .map((line) => ({
      account_id: line.account_id,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
    }))
    .filter((line) => line.account_id && (line.debit > 0 || line.credit > 0));

  for (const line of filtered) {
    if (line.debit > 0 && line.credit > 0) {
      throw new Error("Each line must have either debit or credit.");
    }
  }

  if (filtered.length === 0) {
    throw new Error("At least one valid journal line is required.");
  }

  return filtered;
};

const ensureAccountsInCompany = async (
  companyId: string,
  lines: JournalLineInput[]
) => {
  const accountIds = Array.from(new Set(lines.map((line) => line.account_id)));
  const { data, error } = await supabaseAdmin()
    .from("accounts")
    .select("id")
    .eq("company_id", companyId)
    .in("id", accountIds);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length !== accountIds.length) {
    throw new Error("One or more accounts are not in the selected company.");
  }
};

const ensurePeriodOpen = async (periodId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("periods")
    .select("status")
    .eq("id", periodId)
    .single();

  if (error || !data) {
    throw new Error("Period not found.");
  }

  if (data.status !== "open") {
    throw new Error("Journal period is closed.");
  }
};

export const createJournalDraft = async (
  company_id: string,
  period_id: string,
  entry_date: string,
  narration: string,
  lines: JournalLineInput[]
) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, company_id);

  const { data: period, error: periodError } = await supabaseAdmin()
    .from("periods")
    .select("id, company_id")
    .eq("id", period_id)
    .single();

  if (periodError || !period) {
    throw new Error("Period not found.");
  }

  if (period.company_id !== company_id) {
    throw new Error("Period does not belong to company.");
  }

  const normalizedLines = normalizeLines(lines);
  await ensureAccountsInCompany(company_id, normalizedLines);

  const { data: journal, error } = await supabaseAdmin()
    .from("journal_entries")
    .insert({
      company_id,
      period_id,
      entry_date,
      narration,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !journal) {
    throw new Error(error?.message ?? "Failed to create journal.");
  }

  const { error: lineError } = await supabaseAdmin()
    .from("journal_lines")
    .insert(
      normalizedLines.map((line) => ({
        journal_id: journal.id,
        account_id: line.account_id,
        debit: line.debit,
        credit: line.credit,
      }))
    );

  if (lineError) {
    throw new Error(lineError.message);
  }

  await insertAuditLog({
    company_id,
    entity: "journal_entries",
    entity_id: journal.id,
    action: "created_draft",
    after: { narration, entry_date, line_count: normalizedLines.length },
    created_by: user.id,
  });

  return journal;
};

export const approveJournal = async (journal_id: string) => {
  const user = await requireUser();

  const { data: journal, error } = await supabaseAdmin()
    .from("journal_entries")
    .select("id, company_id, status, created_by")
    .eq("id", journal_id)
    .single();

  if (error || !journal) {
    throw new Error(error?.message ?? "Journal not found.");
  }

  await requireCompanyRole(user.id, journal.company_id, ["Admin", "Manager"]);

  if (journal.created_by === user.id) {
    throw new Error("Makers cannot approve their own journals.");
  }

  if (journal.status !== "draft") {
    throw new Error("Only draft journals can be approved.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("journal_entries")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", journal_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: journal.company_id,
    entity: "journal_entries",
    entity_id: journal_id,
    action: "approved",
    before: { status: journal.status },
    after: { status: "approved" },
    created_by: user.id,
  });
};

export const postJournal = async (journal_id: string) => {
  const user = await requireUser();

  const { data: journal, error } = await supabaseAdmin()
    .from("journal_entries")
    .select("id, company_id, status, period_id")
    .eq("id", journal_id)
    .single();

  if (error || !journal) {
    throw new Error(error?.message ?? "Journal not found.");
  }

  await requireCompanyRole(user.id, journal.company_id, ["Admin", "Manager"]);

  if (journal.status !== "approved") {
    throw new Error("Only approved journals can be posted.");
  }

  const { data: period, error: periodError } = await supabaseAdmin()
    .from("periods")
    .select("status")
    .eq("id", journal.period_id)
    .single();

  if (periodError || !period) {
    throw new Error("Period not found.");
  }

  if (period.status !== "open") {
    throw new Error("Journal period is closed.");
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("journal_lines")
    .select("debit, credit")
    .eq("journal_id", journal_id);

  if (lineError) {
    throw new Error(lineError.message);
  }

  if (!lines || lines.length === 0) {
    throw new Error("Journal has no lines.");
  }

  const totals = (lines ?? []).reduce(
    (acc, line) => {
      acc.debit += Number(line.debit) || 0;
      acc.credit += Number(line.credit) || 0;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  if (Math.abs(totals.debit - totals.credit) > 0.005) {
    throw new Error("Journal is not balanced.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("journal_entries")
    .update({
      status: "posted",
      posted_by: user.id,
      posted_at: new Date().toISOString(),
    })
    .eq("id", journal_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: journal.company_id,
    entity: "journal_entries",
    entity_id: journal_id,
    action: "posted",
    before: { status: journal.status },
    after: { status: "posted", totals },
    created_by: user.id,
  });
};

export const createPostedJournalFromLines = async (payload: {
  company_id: string;
  period_id: string;
  entry_date: string;
  narration: string;
  lines: JournalLineInput[];
  user_id: string;
}) => {
  const normalizedLines = normalizeLines(payload.lines);
  await ensureAccountsInCompany(payload.company_id, normalizedLines);
  await ensurePeriodOpen(payload.period_id);

  const totals = normalizedLines.reduce(
    (acc, line) => {
      acc.debit += line.debit;
      acc.credit += line.credit;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  if (Math.abs(totals.debit - totals.credit) > 0.005) {
    throw new Error("Journal is not balanced.");
  }

  const { data: journal, error } = await supabaseAdmin()
    .from("journal_entries")
    .insert({
      company_id: payload.company_id,
      period_id: payload.period_id,
      entry_date: payload.entry_date,
      narration: payload.narration,
      status: "posted",
      created_by: payload.user_id,
      approved_by: payload.user_id,
      approved_at: new Date().toISOString(),
      posted_by: payload.user_id,
      posted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !journal) {
    throw new Error(error?.message ?? "Failed to create journal.");
  }

  const { error: lineError } = await supabaseAdmin()
    .from("journal_lines")
    .insert(
      normalizedLines.map((line) => ({
        journal_id: journal.id,
        account_id: line.account_id,
        debit: line.debit,
        credit: line.credit,
      }))
    );

  if (lineError) {
    throw new Error(lineError.message);
  }

  await insertAuditLog({
    company_id: payload.company_id,
    entity: "journal_entries",
    entity_id: journal.id,
    action: "created_posted",
    after: { totals },
    created_by: payload.user_id,
  });

  return journal.id as string;
};

export const reverseJournal = async (journal_id: string, reason: string) => {
  const user = await requireUser();

  const { data: journal, error } = await supabaseAdmin()
    .from("journal_entries")
    .select("id, company_id, status, period_id, entry_date, narration")
    .eq("id", journal_id)
    .single();

  if (error || !journal) {
    throw new Error(error?.message ?? "Journal not found.");
  }

  await requireCompanyRole(user.id, journal.company_id, ["Admin", "Manager"]);

  if (journal.status !== "posted") {
    throw new Error("Only posted journals can be reversed.");
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("journal_lines")
    .select("account_id, debit, credit")
    .eq("journal_id", journal_id);

  if (lineError) {
    throw new Error(lineError.message);
  }

  if (!lines || lines.length === 0) {
    throw new Error("Journal has no lines to reverse.");
  }

  const reversalLines = (lines ?? []).map((line) => ({
    account_id: line.account_id,
    debit: Number(line.credit) || 0,
    credit: Number(line.debit) || 0,
  }));

  const { data: reversal, error: reversalError } = await supabaseAdmin()
    .from("journal_entries")
    .insert({
      company_id: journal.company_id,
      period_id: journal.period_id,
      entry_date: new Date().toISOString().slice(0, 10),
      narration: `Reversal: ${reason}`,
      status: "posted",
      created_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      posted_by: user.id,
      posted_at: new Date().toISOString(),
      reversal_of: journal.id,
    })
    .select("id")
    .single();

  if (reversalError || !reversal) {
    throw new Error(reversalError?.message ?? "Failed to create reversal.");
  }

  const { error: reversalLineError } = await supabaseAdmin()
    .from("journal_lines")
    .insert(
      reversalLines.map((line) => ({
        journal_id: reversal.id,
        account_id: line.account_id,
        debit: line.debit,
        credit: line.credit,
      }))
    );

  if (reversalLineError) {
    throw new Error(reversalLineError.message);
  }

  const { error: updateError } = await supabaseAdmin()
    .from("journal_entries")
    .update({
      status: "reversed",
      reversed_by: user.id,
      reversed_at: new Date().toISOString(),
    })
    .eq("id", journal_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: journal.company_id,
    entity: "journal_entries",
    entity_id: journal_id,
    action: "reversed",
    before: { status: journal.status, narration: journal.narration },
    after: { status: "reversed", reason, reversal_id: reversal.id },
    created_by: user.id,
  });
};
