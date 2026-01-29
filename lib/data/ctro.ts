"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

type CtroLine = {
  id: string;
  depot_id: string | null;
  depot?: { name?: string }[] | { name?: string } | null;
  center?: { name?: string }[] | { name?: string } | null;
  tod_time: string | null;
  waybill_no: string | null;
  ctro_ref_no: string | null;
  cwc: string | null;
  purity_cert_no: string | null;
  line_date: string | null;
  bags: number | null;
  tonnage: number | null;
  applied_producer_price_per_tonne: number | null;
  applied_buyer_margin_per_tonne: number | null;
  applied_secondary_evac_cost_per_tonne: number | null;
  applied_takeover_price_per_tonne: number | null;
  producer_price_value: number | null;
  buyers_margin_value: number | null;
  evacuation_cost: number | null;
  evacuation_treatment: string | null;
  line_total: number | null;
};

export const getCtroById = async (ctroId: string, companyId?: string) => {
  if (!ctroId || ctroId === "undefined") {
    throw new Error("CTRO not found.");
  }
  const { data: header, error: headerError } = await supabaseAdmin()
    .from("ctro_headers")
    .select(
      "id, company_id, period_id, ctro_no, season, ctro_date, region, status, remarks, created_by, submitted_at, posted_at, evacuation_payment_mode, evacuation_cash_account_id, agent_id"
    )
    .eq("id", ctroId)
    .single();

  if (headerError || !header) {
    throw new Error(headerError?.message ?? `CTRO not found. id=${ctroId}`);
  }

  if (companyId && header.company_id !== companyId) {
    throw new Error(
      `CTRO does not belong to the active company. id=${ctroId} company=${companyId}`
    );
  }

  let companyName: string | null = null;
  const { data: companyData } = await supabaseAdmin()
    .from("companies")
    .select("name")
    .eq("id", header.company_id)
    .maybeSingle();
  if (companyData?.name) {
    companyName = companyData.name;
  }

  let agentName: string | null = null;
  if (header.agent_id) {
    const { data: agentData } = await supabaseAdmin()
      .from("cocoa_agents")
      .select("name")
      .eq("id", header.agent_id)
      .maybeSingle();
    if (agentData?.name) {
      agentName = agentData.name;
    }
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("ctro_lines")
    .select(
      "id, depot_id, depot:cocoa_depots ( name ), center:takeover_centers ( name ), tod_time, waybill_no, ctro_ref_no, cwc, purity_cert_no, line_date, bags, tonnage, applied_producer_price_per_tonne, applied_buyer_margin_per_tonne, applied_secondary_evac_cost_per_tonne, applied_takeover_price_per_tonne, producer_price_value, buyers_margin_value, evacuation_cost, evacuation_treatment, line_total"
    )
    .eq("ctro_id", ctroId)
    .order("line_date", { ascending: true });

  let safeLines: CtroLine[] = (lines ?? []) as CtroLine[];
  let lineErrorMessage: string | null = null;

  if (lineError) {
    lineErrorMessage = lineError.message;
    const { data: fallbackLines, error: fallbackError } = await supabaseAdmin()
      .from("ctro_lines")
      .select(
        "id, depot_id, takeover_center_id, tod_time, waybill_no, ctro_ref_no, cwc, purity_cert_no, line_date, bags, tonnage, applied_producer_price_per_tonne, applied_buyer_margin_per_tonne, applied_secondary_evac_cost_per_tonne, applied_takeover_price_per_tonne, producer_price_value, buyers_margin_value, evacuation_cost, evacuation_treatment, line_total"
      )
      .eq("ctro_id", ctroId)
      .order("line_date", { ascending: true });

    if (!fallbackError) {
      safeLines = (fallbackLines ?? []).map((line) => ({
        ...(line as CtroLine),
        depot: null,
        center: null,
      }));
    } else if (!lineErrorMessage) {
      lineErrorMessage = fallbackError.message;
    } else {
      lineErrorMessage = `${lineErrorMessage}; ${fallbackError.message}`;
    }
  }

  const { data: totals } = await supabaseAdmin()
    .from("ctro_totals")
    .select(
      "total_bags, total_tonnage, total_evacuation, total_producer_price, total_buyers_margin, grand_total"
    )
    .eq("ctro_id", ctroId)
    .maybeSingle();

  const enrichedHeader = {
    ...header,
    company: companyName ? { name: companyName } : null,
    cocoa_agents: agentName ? [{ name: agentName }] : null,
  };

  return { header: enrichedHeader, lines: safeLines, totals, lineErrorMessage };
};
