"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyAccess, requireUser } from "@/lib/auth";
import { canAnyRole, type DocStatus } from "@/lib/permissions";
import { createPostedJournalFromLines } from "@/lib/actions/journals";

type CtroLineInput = {
  district?: string;
  tod_time?: string;
  waybill_no?: string;
  ctro_ref_no?: string;
  cwc?: string;
  purity_cert_no?: string;
  line_date?: string;
  bags?: number;
  tonnage?: number;
  producer_price_value?: number;
  buyers_margin_value?: number;
  evacuation_cost?: number;
  evacuation_treatment?: "company_paid" | "deducted";
};

type CtroTotals = {
  total_bags: number;
  total_tonnage: number;
  total_evacuation: number;
  total_producer_price: number;
  total_buyers_margin: number;
  grand_total: number;
};

type CtroAccounts = {
  cocoa_stock_field_account_id: string | null;
  cocoa_stock_evacuation_account_id: string | null;
  cocoa_stock_margin_account_id: string | null;
  advances_to_agents_account_id: string | null;
  buyers_margin_income_account_id: string | null;
  evacuation_payable_account_id: string | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const computeTotals = (lines: CtroLineInput[]) => {
  const totals: CtroTotals = {
    total_bags: 0,
    total_tonnage: 0,
    total_evacuation: 0,
    total_producer_price: 0,
    total_buyers_margin: 0,
    grand_total: 0,
  };

  const normalizedLines = lines.map((line) => {
    const bags = Number(line.bags || 0);
    const tonnage = Number(line.tonnage || 0);
    const evacuation = round2(Number(line.evacuation_cost || 0));
    const producer = round2(Number(line.producer_price_value || 0));
    const margin = round2(Number(line.buyers_margin_value || 0));
    const lineTotal = round2(evacuation + producer + margin);

    totals.total_bags += bags;
    totals.total_tonnage += tonnage;
    totals.total_evacuation += evacuation;
    totals.total_producer_price += producer;
    totals.total_buyers_margin += margin;
    totals.grand_total += lineTotal;

    return {
      ...line,
      bags,
      tonnage,
      evacuation_cost: evacuation,
      producer_price_value: producer,
      buyers_margin_value: margin,
      line_total: lineTotal,
      evacuation_treatment: line.evacuation_treatment ?? "company_paid",
    };
  });

  totals.total_tonnage = Number(totals.total_tonnage.toFixed(3));
  totals.total_evacuation = round2(totals.total_evacuation);
  totals.total_producer_price = round2(totals.total_producer_price);
  totals.total_buyers_margin = round2(totals.total_buyers_margin);
  totals.grand_total = round2(totals.grand_total);

  return { totals, normalizedLines };
};

const getCtroAccounts = async (companyId: string) => {
  const { data, error } = await supabaseAdmin()
    .from("ctro_accounts")
    .select(
      "cocoa_stock_field_account_id, cocoa_stock_evacuation_account_id, cocoa_stock_margin_account_id, advances_to_agents_account_id, buyers_margin_income_account_id, evacuation_payable_account_id"
    )
    .eq("company_id", companyId)
    .single();

  if (error) {
    return null;
  }

  return data as CtroAccounts;
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
    throw new Error("Period is closed.");
  }
};

const nextCtroNumber = async (companyId: string, ctroDate: string) => {
  const year = new Date(ctroDate).getFullYear();
  const prefix = `CTRO-${year}-`;
  const { data } = await supabaseAdmin()
    .from("ctro_headers")
    .select("ctro_no")
    .eq("company_id", companyId)
    .like("ctro_no", `${prefix}%`)
    .order("ctro_no", { ascending: false })
    .limit(1);

  const last = data?.[0]?.ctro_no ?? null;
  if (!last) {
    return `${prefix}0001`;
  }

  const suffix = last.replace(prefix, "");
  const number = Number.parseInt(suffix, 10);
  if (Number.isNaN(number)) {
    return `${prefix}0001`;
  }

  return `${prefix}${String(number + 1).padStart(4, "0")}`;
};

const insertAuditLog = async (payload: {
  company_id: string;
  entity: string;
  entity_id: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  created_by: string;
}) => {
  const { error } = await supabaseAdmin().from("audit_logs").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
};

export const createCtroDraft = async (payload: {
  company_id: string;
  period_id: string;
  season: string;
  ctro_date: string;
  region: string;
  agent_id?: string | null;
  remarks?: string | null;
  evacuation_payment_mode: "payable" | "cash";
  evacuation_cash_account_id?: string | null;
  lines: CtroLineInput[];
}) => {
  const user = await requireUser();
  await requireCompanyAccess(user.id, payload.company_id);

  if (!payload.ctro_date) {
    throw new Error("CTRO date is required.");
  }

  const ctroNo = await nextCtroNumber(payload.company_id, payload.ctro_date);
  const { totals, normalizedLines } = computeTotals(payload.lines);
  if (normalizedLines.length === 0) {
    throw new Error("At least one CTRO line is required.");
  }

  const { data: header, error } = await supabaseAdmin()
    .from("ctro_headers")
    .insert({
      company_id: payload.company_id,
      period_id: payload.period_id,
      ctro_no: ctroNo,
      season: payload.season,
      ctro_date: payload.ctro_date,
      region: payload.region,
      agent_id: payload.agent_id ?? null,
      status: "draft",
      remarks: payload.remarks ?? null,
      created_by: user.id,
      evacuation_payment_mode: payload.evacuation_payment_mode,
      evacuation_cash_account_id: payload.evacuation_cash_account_id ?? null,
    })
    .select("id")
    .single();

  if (error || !header) {
    throw new Error(error?.message ?? "Unable to create CTRO.");
  }

  const { error: lineError } = await supabaseAdmin().from("ctro_lines").insert(
    normalizedLines.map((line) => ({
      ctro_id: header.id,
      district: line.district ?? null,
      tod_time: line.tod_time ?? null,
      waybill_no: line.waybill_no ?? null,
      ctro_ref_no: line.ctro_ref_no ?? null,
      cwc: line.cwc ?? null,
      purity_cert_no: line.purity_cert_no ?? null,
      line_date: line.line_date ?? null,
      bags: line.bags ?? 0,
      tonnage: line.tonnage ?? 0,
      producer_price_value: line.producer_price_value ?? 0,
      buyers_margin_value: line.buyers_margin_value ?? 0,
      evacuation_cost: line.evacuation_cost ?? 0,
      evacuation_treatment: line.evacuation_treatment ?? "company_paid",
      line_total: line.line_total ?? 0,
    }))
  );

  if (lineError) {
    throw new Error(lineError.message);
  }

  const { error: totalsError } = await supabaseAdmin().from("ctro_totals").upsert({
    ctro_id: header.id,
    total_bags: totals.total_bags,
    total_tonnage: totals.total_tonnage,
    total_evacuation: totals.total_evacuation,
    total_producer_price: totals.total_producer_price,
    total_buyers_margin: totals.total_buyers_margin,
    grand_total: totals.grand_total,
    updated_at: new Date().toISOString(),
  });

  if (totalsError) {
    throw new Error(totalsError.message);
  }

  await insertAuditLog({
    company_id: payload.company_id,
    entity: "ctro_headers",
    entity_id: header.id,
    action: "created",
    after: { totals },
    created_by: user.id,
  });

  return header.id as string;
};

export const submitCtro = async (ctro_id: string) => {
  const user = await requireUser();
  const { data: header, error } = await supabaseAdmin()
    .from("ctro_headers")
    .select("id, company_id, status")
    .eq("id", ctro_id)
    .single();

  if (error || !header) {
    throw new Error(error?.message ?? "CTRO not found.");
  }

  if (header.status === "posted") {
    throw new Error("CTRO is already posted.");
  }

  const companyRoles = await requireCompanyAccess(user.id, header.company_id);
  const submitPermission = canAnyRole(
    companyRoles.map((role) => role.role),
    header.status as DocStatus,
    "SUBMIT"
  );
  if (!submitPermission.allowed) {
    throw new Error(
      submitPermission.reason ?? "You do not have permission to submit."
    );
  }

  if (header.status !== "draft") {
    throw new Error("Only draft CTROs can be submitted.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("ctro_headers")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", ctro_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: header.company_id,
    entity: "ctro_headers",
    entity_id: ctro_id,
    action: "submitted",
    before: { status: header.status },
    after: { status: "submitted" },
    created_by: user.id,
  });
};

export const postCtro = async (
  ctro_id: string,
  options: { skipApproval?: boolean } = {}
) => {
  const user = await requireUser();
  const { data: header, error } = await supabaseAdmin()
    .from("ctro_headers")
    .select(
      "id, company_id, period_id, ctro_date, status, remarks, evacuation_payment_mode, evacuation_cash_account_id"
    )
    .eq("id", ctro_id)
    .single();

  if (error || !header) {
    throw new Error(error?.message ?? "CTRO not found.");
  }

  if (header.status === "posted") {
    throw new Error("CTRO is already posted.");
  }

  const companyRoles = await requireCompanyAccess(user.id, header.company_id);
  const postPermission = canAnyRole(
    companyRoles.map((role) => role.role),
    header.status as DocStatus,
    "POST"
  );
  if (!postPermission.allowed) {
    throw new Error(postPermission.reason ?? "You do not have permission to post.");
  }

  if (!options.skipApproval && header.status !== "submitted") {
    throw new Error("Only submitted CTROs can be posted.");
  }

  await ensurePeriodOpen(header.period_id);

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("ctro_lines")
    .select("producer_price_value, buyers_margin_value, evacuation_cost, evacuation_treatment")
    .eq("ctro_id", ctro_id);

  if (lineError) {
    throw new Error(lineError.message);
  }

  let producerPrice = 0;
  let buyersMargin = 0;
  let evacuationPaid = 0;
  let evacuationDeducted = 0;

  for (const line of lines ?? []) {
    producerPrice += Number(line.producer_price_value || 0);
    buyersMargin += Number(line.buyers_margin_value || 0);
    const evacuation = Number(line.evacuation_cost || 0);
    if (line.evacuation_treatment === "deducted") {
      evacuationDeducted += evacuation;
    } else {
      evacuationPaid += evacuation;
    }
  }

  producerPrice = round2(producerPrice);
  buyersMargin = round2(buyersMargin);
  evacuationPaid = round2(evacuationPaid);
  evacuationDeducted = round2(evacuationDeducted);

  const accounts = await getCtroAccounts(header.company_id);
  if (
    !accounts?.cocoa_stock_field_account_id ||
    !accounts.cocoa_stock_margin_account_id ||
    !accounts.cocoa_stock_evacuation_account_id ||
    !accounts.advances_to_agents_account_id ||
    !accounts.buyers_margin_income_account_id
  ) {
    throw new Error("Cocoa accounts are not configured. Ask Admin to run setup.");
  }

  if (evacuationPaid > 0 && header.evacuation_payment_mode !== "cash") {
    if (!accounts.evacuation_payable_account_id) {
      throw new Error("Evacuation payable account is not configured.");
    }
  }

  if (evacuationPaid > 0 && header.evacuation_payment_mode === "cash") {
    if (!header.evacuation_cash_account_id) {
      throw new Error("Cash/Bank account is required for evacuation payment.");
    }
  }

  const journalLines: Array<{ account_id: string; debit: number; credit: number }> = [];

  if (producerPrice > 0) {
    journalLines.push({
      account_id: accounts.cocoa_stock_field_account_id,
      debit: producerPrice,
      credit: 0,
    });
    journalLines.push({
      account_id: accounts.advances_to_agents_account_id,
      debit: 0,
      credit: producerPrice,
    });
  }

  if (buyersMargin > 0) {
    journalLines.push({
      account_id: accounts.cocoa_stock_margin_account_id,
      debit: buyersMargin,
      credit: 0,
    });
    journalLines.push({
      account_id: accounts.buyers_margin_income_account_id,
      debit: 0,
      credit: buyersMargin,
    });
  }

  const totalEvacuation = round2(evacuationPaid + evacuationDeducted);
  if (totalEvacuation > 0) {
    journalLines.push({
      account_id: accounts.cocoa_stock_evacuation_account_id,
      debit: totalEvacuation,
      credit: 0,
    });
  }

  if (evacuationPaid > 0) {
    const creditAccount =
      header.evacuation_payment_mode === "cash"
        ? header.evacuation_cash_account_id
        : accounts.evacuation_payable_account_id;
    if (!creditAccount) {
      throw new Error("Evacuation payable/cash account is required.");
    }
    journalLines.push({
      account_id: creditAccount,
      debit: 0,
      credit: evacuationPaid,
    });
  }

  if (evacuationDeducted > 0) {
    journalLines.push({
      account_id: accounts.advances_to_agents_account_id,
      debit: 0,
      credit: evacuationDeducted,
    });
  }

  const journalId = await createPostedJournalFromLines({
    company_id: header.company_id,
    period_id: header.period_id,
    entry_date: header.ctro_date,
    narration: header.remarks ?? "CTRO",
    lines: journalLines,
    user_id: user.id,
  });

  await supabaseAdmin().from("ctro_journals").upsert({
    ctro_id: header.id,
    journal_id: journalId,
  });

  const { error: updateError } = await supabaseAdmin()
    .from("ctro_headers")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", ctro_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await insertAuditLog({
    company_id: header.company_id,
    entity: "ctro_headers",
    entity_id: header.id,
    action: "posted",
    before: { status: header.status },
    after: { status: "posted", journal_id: journalId },
    created_by: user.id,
  });
};

export const deleteCtroDraft = async (ctro_id: string) => {
  const user = await requireUser();
  const { data: header, error } = await supabaseAdmin()
    .from("ctro_headers")
    .select("id, company_id, status")
    .eq("id", ctro_id)
    .single();

  if (error || !header) {
    throw new Error(error?.message ?? "CTRO not found.");
  }

  const companyRoles = await requireCompanyAccess(user.id, header.company_id);
  const deletePermission = canAnyRole(
    companyRoles.map((role) => role.role),
    header.status as DocStatus,
    "DELETE_DRAFT"
  );
  if (!deletePermission.allowed) {
    throw new Error(deletePermission.reason ?? "You do not have permission to delete.");
  }

  if (header.status !== "draft") {
    throw new Error("Only draft CTROs can be deleted.");
  }

  const { error: deleteError } = await supabaseAdmin()
    .from("ctro_headers")
    .delete()
    .eq("id", ctro_id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await insertAuditLog({
    company_id: header.company_id,
    entity: "ctro_headers",
    entity_id: ctro_id,
    action: "deleted",
    before: { status: header.status },
    created_by: user.id,
  });
};
