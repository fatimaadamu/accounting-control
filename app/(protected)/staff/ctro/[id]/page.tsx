import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import ToastMessage from "@/components/toast-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCtroDraft, postCtro, submitCtro } from "@/lib/actions/ctro";
import {
  ensureActiveCompanyId,
  getUserCompanyRoles,
  requireCompanyAccess,
  requireUser,
} from "@/lib/auth";
import { canAnyRole } from "@/lib/permissions";
import { getCtroById } from "@/lib/data/ctro";
import { formatBags, formatMoney, formatTonnage } from "@/lib/format";
import { isSchemaCacheError, schemaCacheBannerMessage } from "@/lib/supabase/schema-cache";

export default async function CtroDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Promise<{ toast?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await requireUser();
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
  if (!params?.id || params.id === "undefined" || !isUuid(params.id)) {
    notFound();
  }
  const companyId = await ensureActiveCompanyId(user.id, `/staff/ctro/${params.id}`);

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);
  const roles = await getUserCompanyRoles(user.id);
  const companyRoles = roles
    .filter((role) => role.company_id === companyId)
    .map((role) => role.role);
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

  let header: Awaited<ReturnType<typeof getCtroById>>["header"];
  let lines: Awaited<ReturnType<typeof getCtroById>>["lines"];
  let totals: Awaited<ReturnType<typeof getCtroById>>["totals"];
  let lineErrorMessage: Awaited<ReturnType<typeof getCtroById>>["lineErrorMessage"];
  try {
    const data = await getCtroById(params.id, companyId);
    ({ header, lines, totals, lineErrorMessage } = data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message) {
      console.error("[CTRO detail error]", message, {
        ctroId: params.id,
        companyId,
      });
    }
    if (isSchemaCacheError({ message })) {
      return renderSchemaBanner();
    }
    if (message.includes("CTRO not found") || message.includes("CTRO does not belong")) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "CTRO not found for the active company."
        )}`
      );
    }
    throw error;
  }

  if (lineErrorMessage) {
    console.error("[CTRO line fetch error]", lineErrorMessage, {
      ctroId: params.id,
      companyId,
    });
  }

  async function submitAction() {
    "use server";
    try {
      await submitCtro(params.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit CTRO.";
      redirect(`/staff/ctro/${params.id}?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath(`/staff/ctro/${params.id}`);
    redirect(`/staff/ctro/${params.id}?toast=submitted`);
  }

  async function postAction() {
    "use server";
    try {
      await postCtro(params.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to post CTRO.";
      redirect(`/staff/ctro/${params.id}?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath(`/staff/ctro/${params.id}`);
    redirect(`/staff/ctro/${params.id}?toast=posted`);
  }

  async function submitAndPostAction() {
    "use server";
    try {
      await submitCtro(params.id);
      await postCtro(params.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit and post CTRO.";
      redirect(`/staff/ctro/${params.id}?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath(`/staff/ctro/${params.id}`);
    redirect(`/staff/ctro/${params.id}?toast=posted`);
  }

  async function deleteAction() {
    "use server";
    try {
      await deleteCtroDraft(params.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete CTRO.";
      redirect(`/staff/ctro/${params.id}?toast=error&message=${encodeURIComponent(message)}`);
    }
    revalidatePath("/staff/ctro");
    redirect("/staff/ctro?toast=deleted");
  }

  const agent = Array.isArray(header.cocoa_agents) ? header.cocoa_agents[0] : header.cocoa_agents;

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={
            resolvedSearchParams.toast === "submitted"
              ? "CTRO submitted"
              : resolvedSearchParams.toast === "posted"
              ? "CTRO posted"
              : resolvedSearchParams.toast === "deleted"
              ? "CTRO deleted"
              : resolvedSearchParams.message ?? "Action completed"
          }
        />
      )}

      <div className="flex items-center justify-between">
        <Link
          href="/staff/ctro"
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          Back to CTRO list
        </Link>
        <div className="flex items-center gap-2">
          {header.status === "posted" && (
            <Link
              href={`/staff/ctro/${params.id}/print-cocoabod`}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              target="_blank"
            >
              Print
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CTRO {header.ctro_no}</CardTitle>
          <CardDescription>{header.season ?? ""}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-zinc-600 md:grid-cols-2">
          <div>Date: {header.ctro_date}</div>
          <div>Region: {header.region ?? "-"}</div>
          <div>Agent: {(agent as { name?: string } | null)?.name ?? "-"}</div>
          <div>Status: {header.status}</div>
          <div>Remarks: {header.remarks ?? "-"}</div>
        </CardContent>
      </Card>

      {lineErrorMessage && (
        <Card>
          <CardHeader>
            <CardTitle>CTRO lines unavailable</CardTitle>
            <CardDescription>
              CTRO loaded but lines could not be fetched. Please refresh or contact admin.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Depot</TableHead>
                <TableHead>Waybill</TableHead>
                <TableHead>CTRO Ref</TableHead>
                <TableHead>Bags</TableHead>
                <TableHead>Tonnage</TableHead>
                <TableHead>Evacuation</TableHead>
                <TableHead>Producer Price</TableHead>
                <TableHead>Margin</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-sm text-zinc-500">
                    No lines yet.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      {(Array.isArray(line.depot)
                        ? line.depot[0]?.name
                        : (line.depot as { name?: string } | null)?.name) ??
                        (line.depot_id ?? "-")}
                    </TableCell>
                    <TableCell>{line.waybill_no ?? "-"}</TableCell>
                    <TableCell>{line.ctro_ref_no ?? "-"}</TableCell>
                    <TableCell>{formatBags(Number(line.bags ?? 0))}</TableCell>
                    <TableCell>{formatTonnage(Number(line.tonnage ?? 0))}</TableCell>
                    <TableCell>{formatMoney(Number(line.evacuation_cost ?? 0))}</TableCell>
                    <TableCell>{formatMoney(Number(line.producer_price_value ?? 0))}</TableCell>
                    <TableCell>{formatMoney(Number(line.buyers_margin_value ?? 0))}</TableCell>
                    <TableCell>{formatMoney(Number(line.line_total ?? 0))}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-zinc-600 md:grid-cols-3">
          <div>Bags: {formatBags(Number(totals?.total_bags ?? 0))}</div>
          <div>Tonnage: {formatTonnage(Number(totals?.total_tonnage ?? 0))}</div>
          <div>Evacuation: {formatMoney(Number(totals?.total_evacuation ?? 0))}</div>
          <div>Producer price: {formatMoney(Number(totals?.total_producer_price ?? 0))}</div>
          <div>Buyers margin: {formatMoney(Number(totals?.total_buyers_margin ?? 0))}</div>
          <div>Grand total: {formatMoney(Number(totals?.grand_total ?? 0))}</div>
        </CardContent>
      </Card>

      {header.status === "draft" && canSubmitDraft && (
        <div className="flex flex-wrap gap-3">
          <form action={submitAction}>
            <Button type="submit" variant="outline">
              Submit
            </Button>
          </form>
          {isAdmin && canPostSubmitted && (
            <form action={submitAndPostAction}>
              <Button type="submit">Submit &amp; Post</Button>
            </form>
          )}
          {canDeleteDraft && (
            <form action={deleteAction}>
              <Button type="submit" variant="ghost">
                Delete
              </Button>
            </form>
          )}
        </div>
      )}

      {header.status === "submitted" && canPostSubmitted && (
        <form action={postAction}>
          <Button type="submit">Post</Button>
        </form>
      )}
    </div>
  );
}
