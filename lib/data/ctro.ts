"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const getCtroById = async (ctroId: string, companyId?: string) => {
  if (!ctroId || ctroId === "undefined") {
    throw new Error("CTRO not found.");
  }
  const { data: header, error: headerError } = await supabaseAdmin()
    .from("ctro_headers")
    .select(
      "id, company_id, company:companies ( name ), period_id, ctro_no, season, ctro_date, region, status, remarks, created_by, submitted_at, posted_at, evacuation_payment_mode, evacuation_cash_account_id, cocoa_agents ( name )"
    )
    .eq("id", ctroId)
    .single();

  if (headerError || !header) {
    throw new Error(
      headerError?.message ?? `CTRO not found. id=${ctroId}`
    );
  }

  if (companyId && header.company_id !== companyId) {
    throw new Error(
      `CTRO does not belong to the active company. id=${ctroId} company=${companyId}`
    );
  }

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("ctro_lines")
    .select(
      "id, depot_id, depot:cocoa_depots ( name ), center:takeover_centers ( name ), tod_time, waybill_no, ctro_ref_no, cwc, purity_cert_no, line_date, bags, tonnage, applied_producer_price_per_tonne, applied_buyer_margin_per_tonne, applied_secondary_evac_cost_per_tonne, applied_takeover_price_per_tonne, producer_price_value, buyers_margin_value, evacuation_cost, evacuation_treatment, line_total"
    )
    .eq("ctro_id", ctroId)
    .order("line_date", { ascending: true });

  if (lineError) {
    throw new Error(lineError.message);
  }

  const { data: totals } = await supabaseAdmin()
    .from("ctro_totals")
    .select(
      "total_bags, total_tonnage, total_evacuation, total_producer_price, total_buyers_margin, grand_total"
    )
    .eq("ctro_id", ctroId)
    .maybeSingle();

  return { header, lines: lines ?? [], totals };
};
