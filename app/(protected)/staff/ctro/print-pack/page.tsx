import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBags, formatMoney, formatRate, formatTonnage } from "@/lib/format";
import PrintNowButton from "@/components/print-now-button";

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

export default async function CtroPrintPackPage({
  searchParams,
}: {
  searchParams?: Promise<{ ids?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const idsParam = params?.ids ?? "";
  const ids = idsParam
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => isUuid(value));

  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/staff/ctro/print-pack");
  if (!companyId) {
    return null;
  }
  await requireCompanyAccess(user.id, companyId);

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6 text-sm text-zinc-700">
        <p>No CTROs selected for printing.</p>
        <Link
          href="/staff/ctro"
          className="inline-flex items-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Back to CTRO list
        </Link>
      </div>
    );
  }

  const { data: headers, error: headerError } = await supabaseAdmin()
    .from("ctro_headers")
    .select("id, company_id, ctro_no, season, ctro_date, status")
    .in("id", ids)
    .eq("company_id", companyId)
    .order("ctro_date", { ascending: true });

  if (headerError) {
    throw new Error(headerError.message);
  }

  const headerList = headers ?? [];
  const headerIds = headerList.map((ctro) => ctro.id);

  const { data: lines, error: lineError } = await supabaseAdmin()
    .from("ctro_lines")
    .select(
      "id, ctro_id, depot:cocoa_depots ( name ), center:takeover_centers ( name ), waybill_no, ctro_ref_no, cwc, purity_cert_no, purity_cert_date, bags, tonnage, applied_secondary_evac_cost_per_tonne, applied_takeover_price_per_tonne, line_total"
    )
    .in("ctro_id", headerIds)
    .order("line_date", { ascending: true });

  if (lineError) {
    throw new Error(lineError.message);
  }

  const headerMap = new Map(headerList.map((header) => [header.id, header]));
  const flattenedLines = (lines ?? []).map((line) => {
    const header = headerMap.get(line.ctro_id);
    return {
      ...line,
      ctro_no: header?.ctro_no ?? "-",
      ctro_date: header?.ctro_date ?? null,
    };
  });

  const distinctDates = new Set(
    flattenedLines
      .map((line) => line.ctro_date)
      .filter((value) => value)
  );
  const showDateColumn = distinctDates.size > 1;
  const singleDate = distinctDates.size === 1 ? (Array.from(distinctDates)[0] as string) : null;

  const packTotals = flattenedLines.reduce(
    (acc, line) => {
      acc.totalBags += Number(line.bags ?? 0);
      acc.totalTonnage += Number(line.tonnage ?? 0);
      acc.grandTotal += Number(line.line_total ?? 0);
      return acc;
    },
    { totalBags: 0, totalTonnage: 0, grandTotal: 0 }
  );
  async function markPrintedAction(formData: FormData) {
    "use server";
    const selectedIds = formData
      .getAll("ctro_id")
      .map((value) => String(value))
      .filter(Boolean);

    if (selectedIds.length === 0) {
      redirect(
        `/staff/ctro?toast=error&message=${encodeURIComponent(
          "Select at least one CTRO to mark as printed."
        )}`
      );
    }

    try {
      const user = await requireUser();
      const activeCompanyId = await ensureActiveCompanyId(user.id, "/staff/ctro/print-pack");
      if (!activeCompanyId) {
        redirect(
          `/staff/ctro?toast=error&message=${encodeURIComponent("No active company.")}`
        );
      }
      await requireCompanyAccess(user.id, activeCompanyId);

      const { data: foundHeaders, error } = await supabaseAdmin()
        .from("ctro_headers")
        .select("id, company_id, print_count")
        .in("id", selectedIds);

      if (error) {
        throw new Error(error.message);
      }

      const nowIso = new Date().toISOString();
      for (const header of foundHeaders ?? []) {
        if (header.company_id !== activeCompanyId) {
          throw new Error("CTRO does not belong to the active company.");
        }
        const newCount = Number(header.print_count ?? 0) + 1;
        const { error: updateError } = await supabaseAdmin()
          .from("ctro_headers")
          .update({
            printed_at: nowIso,
            printed_by: user.id,
            print_count: newCount,
          })
          .eq("id", header.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to mark CTROs as printed.";
      redirect(`/staff/ctro?toast=error&message=${encodeURIComponent(message)}`);
    }

    revalidatePath("/staff/ctro");
    redirect("/staff/ctro?view=archive&toast=printed");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-sm text-zinc-800">
      <style>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }
        @media print {
          .print-hidden {
            display: none !important;
          }
          body {
            margin: 0;
          }
          thead {
            display: table-header-group;
          }
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          th,
          td {
            padding: 3px 6px !important;
          }
        }
      `}</style>

      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PrintNowButton />
          <form action={markPrintedAction}>
            {headerIds.map((id) => (
              <input key={id} type="hidden" name="ctro_id" value={id} />
            ))}
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Mark as Printed
            </button>
          </form>
        </div>
        <Link
          href="/staff/ctro"
          className="inline-flex items-center rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Back to CTRO list
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold">COCOA MARKETING COMPANY</h1>
        <p className="text-sm font-medium">COCOA HOUSE - ACCRA</p>
        <p className="text-sm font-medium">
          DATE: {formatDate(singleDate)}
        </p>
      </div>

      <table className="w-full border-collapse border border-zinc-200 text-xs">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-200 px-2 py-1 text-left">Depot</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Take-over Centre</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Waybill</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">CTRO No</th>
            {showDateColumn && (
              <th className="border border-zinc-200 px-2 py-1 text-left">CTRO Date</th>
            )}
            <th className="border border-zinc-200 px-2 py-1 text-left">CWC</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Purity Cert No</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Purity Cert Date</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Bags</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Tonnage</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Evac / Tonne</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Take-over Price / Tonne</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {flattenedLines.map((line) => (
            <tr key={line.id}>
              <td className="border border-zinc-200 px-2 py-1">
                {(Array.isArray(line.depot)
                  ? line.depot[0]?.name
                  : (line.depot as { name?: string } | null)?.name) ?? "-"}
              </td>
              <td className="border border-zinc-200 px-2 py-1">
                {(Array.isArray(line.center)
                  ? line.center[0]?.name
                  : (line.center as { name?: string } | null)?.name) ?? "-"}
              </td>
              <td className="border border-zinc-200 px-2 py-1">{line.waybill_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.ctro_no ?? "-"}</td>
              {showDateColumn && (
                <td className="border border-zinc-200 px-2 py-1">{formatDate(line.ctro_date)}</td>
              )}
              <td className="border border-zinc-200 px-2 py-1">{line.cwc ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.purity_cert_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{formatDate(line.purity_cert_date)}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatBags(Number(line.bags ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatTonnage(Number(line.tonnage ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatRate(Number(line.applied_secondary_evac_cost_per_tonne ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatRate(Number(line.applied_takeover_price_per_tonne ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.line_total ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-2 rounded-md border border-zinc-200 p-4 text-xs">
        <div className="flex items-center justify-between">
          <span>Total Bags</span>
          <span className="font-medium">{formatBags(Number(packTotals.totalBags))}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Total Tonnage</span>
          <span className="font-medium">{formatTonnage(Number(packTotals.totalTonnage))}</span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-sm font-semibold">
          <span>GRAND TOTAL</span>
          <span>{formatMoney(Number(packTotals.grandTotal))}</span>
        </div>
      </div>
    </div>
  );
}
