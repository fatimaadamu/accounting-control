"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCompanyRole, requireUser } from "@/lib/auth";

export const closePeriod = async (period_id: string) => {
  const user = await requireUser();

  const { data: period, error } = await supabaseAdmin()
    .from("periods")
    .select("id, company_id, status")
    .eq("id", period_id)
    .single();

  if (error || !period) {
    throw new Error(error?.message ?? "Period not found.");
  }

  await requireCompanyRole(user.id, period.company_id, ["Admin"]);

  if (period.status !== "open") {
    throw new Error("Only open periods can be closed.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("periods")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: user.id,
    })
    .eq("id", period_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await supabaseAdmin().from("audit_logs").insert({
    company_id: period.company_id,
    entity: "periods",
    entity_id: period.id,
    action: "closed",
    before: { status: period.status },
    after: { status: "closed" },
    created_by: user.id,
  });
};

export const reopenPeriod = async (period_id: string, reason: string) => {
  const user = await requireUser();

  const { data: period, error } = await supabaseAdmin()
    .from("periods")
    .select("id, company_id, status")
    .eq("id", period_id)
    .single();

  if (error || !period) {
    throw new Error(error?.message ?? "Period not found.");
  }

  await requireCompanyRole(user.id, period.company_id, ["Admin"]);

  if (period.status !== "closed") {
    throw new Error("Only closed periods can be reopened.");
  }

  const { error: updateError } = await supabaseAdmin()
    .from("periods")
    .update({
      status: "open",
      reopened_at: new Date().toISOString(),
      reopened_by: user.id,
      reopen_reason: reason,
    })
    .eq("id", period_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await supabaseAdmin().from("audit_logs").insert({
    company_id: period.company_id,
    entity: "periods",
    entity_id: period.id,
    action: "reopened",
    before: { status: period.status },
    after: { status: "open", reason },
    created_by: user.id,
  });
};
