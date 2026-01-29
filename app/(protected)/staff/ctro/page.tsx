import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import CtroCreateForm from "@/components/ctro-create-form";
import ToastMessage from "@/components/toast-message";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCtroDraft, deleteCtroDraft, postCtro, submitCtro } from "@/lib/actions/ctro";
import {
  ensureActiveCompanyId,
  getUserCompanyRoles,
  requireCompanyAccess,
  requireUser,
} from "@/lib/auth";
import { formatBags, formatMoney, formatTonnage } from "@/lib/format";
import { canAnyRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSchemaCacheError, schemaCacheBannerMessage } from "@/lib/supabase/schema-cache";
import CtroReprintButton from "@/components/ctro-reprint-button";
import CtroActiveTable from "@/components/ctro-active-table";

type ArchiveLine = {
  id: string;
  ctro_id: string;
  depot?: { name?: string }[] | { name?: string } | null;
  center?: { name?: string }[] | { name?: string } | null;
  waybill_no: string | null;
  ctro_ref_no: string | null;
  cwc: string | null;
  purity_cert_no: string | null;
  purity_cert_date: string | null;
  bags: number | null;
  tonnage: number | null;
  line_total: number | null;
};

export default async function CtroPage({
  searchParams,
}: {
  searchParams?: Promise<{ toast?: string; message?: string; view?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeView = resolvedSearchParams?.view === "archive" ? "archive" : "active";
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/ctro");

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);
  const activeCompanyId = companyId as string;
  const roles = await getUserCompanyRoles(user.id);
  const companyRoles = roles
    .filter((role) => role.company_id === companyId)
    .map((role) => role.role);
  const canCreate = canAnyRole(companyRoles, null, "CREATE").allowed;
  const canSubmitDraft = canAnyRole(companyRoles, "draft", "SUBMIT").allowed;
  const canPostSubmitted = canAnyRole(companyRoles, "submitted", "POST").allowed;
  const canDeleteDraft = canAnyRole(companyRoles, "draft", "DELETE_DRAFT").allowed;
  const isAdmin = companyRoles.includes("Admin");

  const renderSchemaBanner = () => (
    <Card>
      <CardHeader>
        <CardTitle>CTRO</CardTitle>
        <CardDescription>{schemaCacheBannerMessage}</CardDescription>
      </CardHeader>
    </Card>
  );

  const { data: periods, error: periodError } = await supabaseAdmin()
    .from("periods")
    .select("id, period_month, period_year, status, start_date, end_date")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });

  if (periodError) {
    if (isSchemaCacheError(periodError)) {
      console.error("[CTRO schema error]", periodError.message);
      return renderSchemaBanner();
    }
    throw new Error(periodError.message);
  }

  if ((periods ?? []).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CTRO</CardTitle>
          <CardDescription>No periods for this company yet. Ask Admin to set up periods.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: cocoaAccounts, error: accountError } = await supabaseAdmin()
    .from("cocoa_account_config")
    .select(
      "stock_field_account_id, stock_evac_account_id, stock_margin_account_id, advances_account_id, buyer_margin_income_account_id, evacuation_payable_account_id"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (accountError) {
    if (isSchemaCacheError(accountError) || accountError.message.includes("Could not find the table")) {
      console.error("[CTRO schema error]", accountError.message);
      return renderSchemaBanner();
    }
    throw new Error(accountError.message);
  }

  const missingCtroAccounts =
    !cocoaAccounts ||
    !cocoaAccounts.stock_field_account_id ||
    !cocoaAccounts.stock_evac_account_id ||
    !cocoaAccounts.stock_margin_account_id ||
    !cocoaAccounts.buyer_margin_income_account_id ||
    !cocoaAccounts.evacuation_payable_account_id;

  const { data: depots, error: depotError } = await supabaseAdmin()
    .from("cocoa_depots")
    .select("id, name")
    .order("name");

  if (depotError) {
    if (isSchemaCacheError(depotError)) {
      console.error("[CTRO schema error]", depotError.message);
      return renderSchemaBanner();
    }
    throw new Error(depotError.message);
  }

  const { data: centers, error: centerError } = await supabaseAdmin()
    .from("takeover_centers")
    .select("id, name")
    .order("name");

  if (centerError) {
    if (isSchemaCacheError(centerError)) {
      console.error("[CTRO schema error]", centerError.message);
      return renderSchemaBanner();
    }
    throw new Error(centerError.message);
  }

  let ctroQuery = supabaseAdmin()
    .from("ctro_headers")
    .select(
      "id, ctro_no, season, ctro_date, region, status, printed_at, print_count, ctro_totals ( total_bags, total_tonnage, grand_total )"
    )
    .eq("company_id", companyId);

  if (activeView === "archive") {
    ctroQuery = ctroQuery.not("printed_at", "is", null);
  } else {
    ctroQuery = ctroQuery.is("printed_at", null);
  }

  const { data: ctroHeaders, error: ctroError } = await ctroQuery
    .order("ctro_date", { ascending: false })
    .limit(50);

  if (ctroError) {
    if (isSchemaCacheError(ctroError)) {
      console.error("[CTRO schema error]", ctroError.message);
      return renderSchemaBanner();
    }
    throw new Error(ctroError.message);
  }

  const headers = ctroHeaders ?? [];
  const archiveLineMap = new Map<string, ArchiveLine[]>();
  if (activeView === "archive" && headers.length > 0) {
    const { data: archivedLines, error: archivedLinesError } = await supabaseAdmin()
      .from("ctro_lines")
      .select(
        "id, ctro_id, depot_id, depot:cocoa_depots ( name ), center:takeover_centers ( name ), waybill_no, ctro_ref_no, cwc, purity_cert_no, purity_cert_date, bags, tonnage, line_total"
      )
      .in(
        "ctro_id",
        headers.map((ctro) => ctro.id)
      )
      .order("line_date", { ascending: true });

    if (archivedLinesError) {
      if (isSchemaCacheError(archivedLinesError)) {
        console.error("[CTRO schema error]", archivedLinesError.message);
        return renderSchemaBanner();
      }
      throw new Error(archivedLinesError.message);
    }

    for (const line of archivedLines ?? []) {
      const existing = archiveLineMap.get(line.ctro_id) ?? [];
      existing.push(line);
      archiveLineMap.set(line.ctro_id, existing);
    }
  }
  const ctroIdsNeedingTotals = headers
    .filter((ctro) => {
      const totals = Array.isArray(ctro.ctro_totals) ? ctro.ctro_totals[0] : ctro.ctro_totals;
      if (!totals) {
        return true;
      }
      const bags = Number(totals.total_bags ?? 0);
      const tonnage = Number(totals.total_tonnage ?? 0);
      const total = Number(totals.grand_total ?? 0);
      return bags === 0 && tonnage === 0 && total === 0;
    })
    .map((ctro) => ctro.id);

  const computedTotals = new Map<
    string,
    { total_bags: number; total_tonnage: number; grand_total: number }
  >();

  if (ctroIdsNeedingTotals.length > 0) {
    const { data: lineTotals, error: lineTotalsError } = await supabaseAdmin()
      .from("ctro_lines")
      .select("ctro_id, bags, tonnage, line_total")
      .in("ctro_id", ctroIdsNeedingTotals);

    if (lineTotalsError) {
      if (isSchemaCacheError(lineTotalsError)) {
        console.error("[CTRO schema error]", lineTotalsError.message);
        return renderSchemaBanner();
      }
      throw new Error(lineTotalsError.message);
    }

    for (const line of lineTotals ?? []) {
      const entry =
        computedTotals.get(line.ctro_id) ?? {
          total_bags: 0,
          total_tonnage: 0,
          grand_total: 0,
        };
      entry.total_bags += Number(line.bags ?? 0);
      entry.total_tonnage += Number(line.tonnage ?? 0);
      entry.grand_total += Number(line.line_total ?? 0);
      computedTotals.set(line.ctro_id, entry);
    }
  }

  const activeRows = headers.map((ctro) => {
    const totals = Array.isArray(ctro.ctro_totals) ? ctro.ctro_totals[0] : ctro.ctro_totals;
    const fallbackTotals = computedTotals.get(ctro.id);
    const displayTotals = totals ?? fallbackTotals;
    return {
      id: ctro.id,
      ctro_date: ctro.ctro_date,
      ctro_no: ctro.ctro_no,
      season: ctro.season ?? null,
      status: ctro.status,
      total_bags: Number(displayTotals?.total_bags ?? 0),
      total_tonnage: Number(displayTotals?.total_tonnage ?? 0),
      grand_total: Number(displayTotals?.grand_total ?? 0),
    };
  });

  async function createAction(formData: FormData) {
    "use server";
    const toNumber = (value: unknown) => {
      const raw = String(value ?? "").replace(/,/g, "").trim();
      if (!raw) {
        return 0;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const season = String(formData.get("season") ?? "").trim();
    const ctroDate = String(formData.get("ctro_date") ?? "");
    const periodId = String(formData.get("period_id") ?? "");
    const remarks = String(formData.get("remarks") ?? "").trim();
    const linesJson = String(formData.get("lines_json") ?? "[]");
    const lines = JSON.parse(linesJson) as Array<Record<string, string>>;
    const validLines = lines.filter(
      (line) =>
        Boolean(line.depot_id) &&
        Boolean(line.takeover_center_id) &&
        toNumber(line.bags ?? 0) > 0
    );

    if (!ctroDate || !periodId) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "Select CTRO Date to apply rate card."
        )}`
      );
    }

    if (!validLines.length) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "Add at least one valid line with depot, takeover center, and bags."
        )}`
      );
    }

    if (!season) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "No rate card for selected date."
        )}`
      );
    }

    if (
      validLines.some(
        (line) =>
          line.depot_id &&
          line.takeover_center_id &&
          toNumber(line.applied_takeover_price_per_tonne ?? 0) <= 0
      )
    ) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "No published rate found for this depot + takeover center on this date."
        )}`
      );
    }

    try {
      await createCtroDraft({
        company_id: activeCompanyId,
        period_id: periodId,
        season,
        ctro_date: ctroDate,
        remarks: remarks || null,
        evacuation_payment_mode: "payable",
        evacuation_cash_account_id: null,
        lines: validLines.map((line) => ({
          tod_time: line.tod_time,
          waybill_no: line.waybill_no,
          ctro_ref_no: line.ctro_ref_no,
          cwc: line.cwc,
          purity_cert_no: line.purity_cert_no,
          purity_cert_date: line.purity_cert_date,
          depot_id: line.depot_id || null,
          takeover_center_id: line.takeover_center_id,
          bag_weight_kg: toNumber(line.bag_weight_kg) || 16,
          bags: toNumber(line.bags) || 0,
          tonnage: toNumber(line.tonnage) || 0,
          applied_producer_price_per_tonne: toNumber(line.applied_producer_price_per_tonne) || 0,
          applied_buyer_margin_per_tonne: toNumber(line.applied_buyer_margin_per_tonne) || 0,
          applied_secondary_evac_cost_per_tonne:
            toNumber(line.applied_secondary_evac_cost_per_tonne) || 0,
          applied_takeover_price_per_tonne:
            toNumber(line.applied_takeover_price_per_tonne) || 0,
          evacuation_cost: toNumber(line.evacuation_cost) || 0,
          evacuation_treatment: (line.evacuation_treatment as "company_paid" | "deducted") ?? "company_paid",
          producer_price_value: toNumber(line.producer_price_value) || 0,
          buyers_margin_value: toNumber(line.buyers_margin_value) || 0,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create CTRO.";
      redirect(`/staff/ctro?toast=error&message=${encodeURIComponent(message)}`);
    }

    revalidatePath("/staff/ctro");
    redirect("/staff/ctro?toast=saved");
  }

  async function submitAction(formData: FormData) {
    "use server";
    const ctroId = String(formData.get("ctro_id") ?? "");
    try {
      await submitCtro(ctroId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit CTRO.";
      redirect(`/staff/ctro?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/ctro");
    redirect("/staff/ctro?toast=submitted");
  }

  async function postAction(formData: FormData) {
    "use server";
    const ctroId = String(formData.get("ctro_id") ?? "");
    try {
      await postCtro(ctroId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to post CTRO.";
      redirect(`/staff/ctro?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/ctro");
    redirect("/staff/ctro?toast=posted");
  }

  async function submitAndPostAction(formData: FormData) {
    "use server";
    const ctroId = String(formData.get("ctro_id") ?? "");
    try {
      await submitCtro(ctroId);
      await postCtro(ctroId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit and post CTRO.";
      redirect(`/staff/ctro?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/ctro");
    redirect("/staff/ctro?toast=posted");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const ctroId = String(formData.get("ctro_id") ?? "");
    try {
      await deleteCtroDraft(ctroId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete CTRO.";
      redirect(`/staff/ctro?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/ctro");
    redirect("/staff/ctro?toast=deleted");
  }

  async function reprintAction(formData: FormData) {
    "use server";
    const ctroId = String(formData.get("ctro_id") ?? "");
    try {
      const user = await requireUser();
      const activeCompanyId = await ensureActiveCompanyId(user.id, "/staff/ctro?view=archive");
      if (!activeCompanyId) {
        return { ok: false, message: "No active company." };
      }
      await requireCompanyAccess(user.id, activeCompanyId);
      const { data: existing, error } = await supabaseAdmin()
        .from("ctro_headers")
        .select("id, company_id, print_count")
        .eq("id", ctroId)
        .single();

      if (error || !existing) {
        return { ok: false, message: "CTRO not found." };
      }
      if (existing.company_id !== activeCompanyId) {
        return { ok: false, message: "CTRO does not belong to the active company." };
      }

      const newCount = Number(existing.print_count ?? 0) + 1;
      const { error: updateError } = await supabaseAdmin()
        .from("ctro_headers")
        .update({
          printed_at: new Date().toISOString(),
          printed_by: user.id,
          print_count: newCount,
        })
        .eq("id", ctroId);

      if (updateError) {
        return { ok: false, message: updateError.message };
      }

      revalidatePath("/staff/ctro");
      return { ok: true, message: "CTRO reprinted." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reprint CTRO.";
      return { ok: false, message };
    }
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={
            resolvedSearchParams.toast === "saved"
              ? "CTRO saved"
              : resolvedSearchParams.toast === "submitted"
              ? "CTRO submitted"
              : resolvedSearchParams.toast === "posted"
              ? "CTRO posted"
              : resolvedSearchParams.toast === "printed"
              ? "CTRO marked as printed"
              : resolvedSearchParams.toast === "deleted"
              ? "CTRO deleted"
              : resolvedSearchParams.message ?? "Action completed"
          }
        />
      )}

      {missingCtroAccounts && (
        <Card>
          <CardHeader>
            <CardTitle>CTRO accounts not configured</CardTitle>
            <CardDescription>
              Set up cocoa accounts in Admin Setup before posting CTROs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/setup"
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Go to Admin Setup
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New CTRO</CardTitle>
          <CardDescription>Capture cocoa taken on receipt.</CardDescription>
        </CardHeader>
        <CardContent>
          {!canCreate ? (
            <p className="text-sm text-zinc-600">
              You do not have permission to create CTROs.
            </p>
          ) : (
            <CtroCreateForm
              action={createAction}
              periods={periods ?? []}
              depots={depots ?? []}
              centers={centers ?? []}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Recent CTROs</CardTitle>
              <CardDescription>Latest 50 CTROs for the active company.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/staff/ctro?view=active"
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  activeView === "active"
                    ? "border-zinc-900 text-zinc-900"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Active
              </Link>
              <Link
                href="/staff/ctro?view=archive"
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  activeView === "archive"
                    ? "border-zinc-900 text-zinc-900"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Archive (Downloaded)
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeView == "active" ? (
            <CtroActiveTable
              rows={activeRows}
              canSubmitDraft={canSubmitDraft}
              canPostSubmitted={canPostSubmitted}
              canDeleteDraft={canDeleteDraft}
              isAdmin={isAdmin}
              missingCtroAccounts={missingCtroAccounts}
              submitAction={submitAction}
              postAction={postAction}
              submitAndPostAction={submitAndPostAction}
              deleteAction={deleteAction}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>CTRO No</TableHead>
                  <TableHead>Season</TableHead>
                  <TableHead>Bags</TableHead>
                  <TableHead>Tonnage</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {headers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-zinc-500">
                      No CTROs yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  headers.map((ctro) => {
                    const totals = Array.isArray(ctro.ctro_totals)
                      ? ctro.ctro_totals[0]
                      : ctro.ctro_totals;
                    const fallbackTotals = computedTotals.get(ctro.id);
                    const displayTotals = totals ?? fallbackTotals;
                    return (
                      <TableRow key={ctro.id}>
                        <TableCell>{ctro.ctro_date}</TableCell>
                        <TableCell>{ctro.ctro_no}</TableCell>
                        <TableCell>{ctro.season ?? "-"}</TableCell>
                        <TableCell>{formatBags(Number(displayTotals?.total_bags ?? 0))}</TableCell>
                        <TableCell>
                          {formatTonnage(Number(displayTotals?.total_tonnage ?? 0))}
                        </TableCell>
                        <TableCell>
                          {formatMoney(Number(displayTotals?.grand_total ?? 0))}
                        </TableCell>
                        <TableCell>{ctro.status}</TableCell>
                        <TableCell className="space-y-2">
                          <Link
                            href={`/staff/ctro/${ctro.id}`}
                            className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            View
                          </Link>
                          <CtroReprintButton action={reprintAction} ctroId={ctro.id} />
                          <details className="rounded-md border border-zinc-200 px-2 py-2 text-xs text-zinc-600">
                            <summary className="cursor-pointer select-none">Lines ?</summary>
                            <div className="mt-2 space-y-2">
                              {(archiveLineMap.get(ctro.id) ?? []).length === 0 ? (
                                <div className="text-zinc-500">No lines found.</div>
                              ) : (
                                <table className="w-full border-collapse border border-zinc-200 text-xs">
                                  <thead>
                                    <tr className="bg-zinc-100">
                                      <th className="border border-zinc-200 px-2 py-1 text-left">
                                        Depot
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-left">
                                        Center
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-left">
                                        Waybill
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-left">
                                        CTRO Ref
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-left">
                                        CWC
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-left">
                                        Purity Cert
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-left">
                                        Purity Date
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-right">
                                        Bags
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-right">
                                        Tonnage
                                      </th>
                                      <th className="border border-zinc-200 px-2 py-1 text-right">
                                        Total
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(archiveLineMap.get(ctro.id) ?? []).map((line) => (
                                      <tr key={line.id}>
                                        <td className="border border-zinc-200 px-2 py-1">
                                          {(Array.isArray(line.depot)
                                            ? line.depot[0]?.name
                                            : (line.depot as { name?: string } | null)?.name) ??
                                            "-"}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1">
                                          {(Array.isArray(line.center)
                                            ? line.center[0]?.name
                                            : (line.center as { name?: string } | null)?.name) ??
                                            "-"}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1">
                                          {line.waybill_no ?? "-"}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1">
                                          {line.ctro_ref_no ?? "-"}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1">
                                          {line.cwc ?? "-"}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1">
                                          {line.purity_cert_no ?? "-"}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1">
                                          {line.purity_cert_date ?? "-"}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1 text-right">
                                          {formatBags(Number(line.bags ?? 0))}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1 text-right">
                                          {formatTonnage(Number(line.tonnage ?? 0))}
                                        </td>
                                        <td className="border border-zinc-200 px-2 py-1 text-right">
                                          {formatMoney(Number(line.line_total ?? 0))}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </details>
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
  );
}
