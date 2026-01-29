import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import CtroCreateForm from "@/components/ctro-create-form";
import ToastMessage from "@/components/toast-message";
import { Button } from "@/components/ui/button";
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

export default async function CtroPage({
  searchParams,
}: {
  searchParams?: Promise<{ toast?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
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
    !cocoaAccounts.advances_account_id ||
    !cocoaAccounts.buyer_margin_income_account_id;

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

  const { data: ctroHeaders, error: ctroError } = await supabaseAdmin()
    .from("ctro_headers")
    .select(
      "id, ctro_no, season, ctro_date, region, status, ctro_totals ( total_bags, total_tonnage, grand_total )"
    )
    .eq("company_id", companyId)
    .order("ctro_date", { ascending: false })
    .limit(50);

  if (ctroError) {
    if (isSchemaCacheError(ctroError)) {
      console.error("[CTRO schema error]", ctroError.message);
      return renderSchemaBanner();
    }
    throw new Error(ctroError.message);
  }

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

    if (!ctroDate || !periodId) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "Select CTRO Date to apply rate card."
        )}`
      );
    }

    if (
      !lines.length ||
      lines.some((line) => toNumber(line.bags ?? 0) <= 0)
    ) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "Each CTRO line must include bags greater than 0."
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
      lines.some(
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
        lines: lines.map((line) => ({
          tod_time: line.tod_time,
          waybill_no: line.waybill_no,
          ctro_ref_no: line.ctro_ref_no,
          cwc: line.cwc,
          purity_cert_no: line.purity_cert_no,
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
          <CardTitle>Recent CTROs</CardTitle>
          <CardDescription>Latest 50 CTROs for the active company.</CardDescription>
        </CardHeader>
        <CardContent>
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
                {(ctroHeaders ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-zinc-500">
                      No CTROs yet.
                    </TableCell>
                  </TableRow>
                ) : (
                ctroHeaders?.map((ctro) => {
                  const totals = Array.isArray(ctro.ctro_totals) ? ctro.ctro_totals[0] : ctro.ctro_totals;
                  return (
                    <TableRow key={ctro.id}>
                      <TableCell>{ctro.ctro_date}</TableCell>
                      <TableCell>{ctro.ctro_no}</TableCell>
                      <TableCell>{ctro.season ?? "-"}</TableCell>
                      <TableCell>{formatBags(Number(totals?.total_bags ?? 0))}</TableCell>
                      <TableCell>{formatTonnage(Number(totals?.total_tonnage ?? 0))}</TableCell>
                      <TableCell>{formatMoney(Number(totals?.grand_total ?? 0))}</TableCell>
                      <TableCell>{ctro.status}</TableCell>
                      <TableCell className="space-y-2">
                        <Link
                          href={`/staff/ctro/${ctro.id}`}
                          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          View
                        </Link>
                        {ctro.status === "draft" && canSubmitDraft && (
                          <form action={submitAction}>
                            <input type="hidden" name="ctro_id" value={ctro.id} />
                            <Button type="submit" variant="outline">
                              Submit
                            </Button>
                          </form>
                        )}
                        {ctro.status === "draft" &&
                          isAdmin &&
                          canSubmitDraft &&
                          canPostSubmitted && (
                            <form action={submitAndPostAction}>
                              <input type="hidden" name="ctro_id" value={ctro.id} />
                              <Button type="submit">
                                Submit &amp; Post
                              </Button>
                            </form>
                          )}
                        {ctro.status === "submitted" && canPostSubmitted && (
                          <form action={postAction}>
                            <input type="hidden" name="ctro_id" value={ctro.id} />
                            <Button type="submit" variant="outline">
                              Post
                            </Button>
                          </form>
                        )}
                        {ctro.status === "draft" && canDeleteDraft && (
                          <form action={deleteAction}>
                            <input type="hidden" name="ctro_id" value={ctro.id} />
                            <Button type="submit" variant="ghost">
                              Delete
                            </Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
