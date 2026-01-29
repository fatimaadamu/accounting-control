import { ensureActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { getCtroById } from "@/lib/data/ctro";
import { formatBags, formatMoney, formatRate } from "@/lib/format";
import { isSchemaCacheError, schemaCacheBannerMessage } from "@/lib/supabase/schema-cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

const formatTonnage3 = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);

export default async function CtroPrintCocoaBodPage({
  params: rawParams,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const params =
    "then" in (rawParams as Promise<{ id: string }>)
      ? await (rawParams as Promise<{ id: string }>)
      : (rawParams as { id: string });
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, `/staff/ctro/${params.id}/print-cocoabod`);

  if (!companyId) {
    return null;
  }

  await requireCompanyAccess(user.id, companyId);
  let header: Awaited<ReturnType<typeof getCtroById>>["header"];
  let lines: Awaited<ReturnType<typeof getCtroById>>["lines"];
  let totals: Awaited<ReturnType<typeof getCtroById>>["totals"];
  try {
    const data = await getCtroById(params.id, companyId);
    ({ header, lines, totals } = data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isSchemaCacheError({ message })) {
      return (
        <div className="mx-auto max-w-2xl p-6 text-sm text-zinc-700">
          {schemaCacheBannerMessage}
        </div>
      );
    }
    throw error;
  }

  if (header.status !== "posted") {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-zinc-700">
        CTRO print is available only after posting.
      </div>
    );
  }

  const currentCount = Number(header.print_count ?? 0) || 0;
  const { error: printError } = await supabaseAdmin()
    .from("ctro_headers")
    .update({
      printed_at: new Date().toISOString(),
      printed_by: user.id,
      print_count: currentCount + 1,
    })
    .eq("id", header.id);

  if (printError) {
    console.error("[CTRO print update error]", printError.message, {
      ctroId: header.id,
      companyId,
    });
  }

  const totalsFromLines = lines.reduce(
    (acc, line) => {
      acc.totalBags += Number(line.bags ?? 0);
      acc.totalTonnage += Number(line.tonnage ?? 0);
      acc.totalProducer += Number(line.producer_price_value ?? 0);
      acc.totalEvac += Number(line.evacuation_cost ?? 0);
      acc.totalMargin += Number(line.buyers_margin_value ?? 0);
      acc.grandTotal += Number(line.line_total ?? 0);
      return acc;
    },
    {
      totalBags: 0,
      totalTonnage: 0,
      totalProducer: 0,
      totalEvac: 0,
      totalMargin: 0,
      grandTotal: 0,
    }
  );

  const computedTotals = {
    totalBags: totals?.total_bags ?? totalsFromLines.totalBags,
    totalTonnage: totals?.total_tonnage ?? totalsFromLines.totalTonnage,
    totalProducer: totals?.total_producer_price ?? totalsFromLines.totalProducer,
    totalEvac: totals?.total_evacuation ?? totalsFromLines.totalEvac,
    totalMargin: totals?.total_buyers_margin ?? totalsFromLines.totalMargin,
    grandTotal: totals?.grand_total ?? totalsFromLines.grandTotal,
  };

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
          header,
          nav,
          .app-header,
          .site-header,
          .main-header {
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
      <div className="print-hidden flex items-center justify-end">
        <PrintNowButton />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">COCOA MARKETING COMPANY</h1>
        <p className="text-sm font-medium">COCOA HOUSE - ACCRA</p>
        <p className="text-sm font-medium">DATE: {formatDate(header.ctro_date)}</p>
        <p className="text-sm font-medium">INVOICE NO: {header.ctro_no ?? "-"}</p>
      </div>

      <table className="w-full border-collapse border border-zinc-200 text-xs">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-200 px-2 py-1 text-left">Region</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">District</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">T.O.P (GHS)</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Waybill</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">C.T.O</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">C.W.C</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Purity Cert.</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Date</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Bags</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Tonn.</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Cost (GHS)</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Evacuation (GHS)</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Producer Price (GHS)</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Buyers&#39; Margin (GHS)</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Total (GHS)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="border border-zinc-200 px-2 py-1">
                {"-"}
              </td>
              <td className="border border-zinc-200 px-2 py-1">
                {(Array.isArray(line.depot)
                  ? line.depot[0]?.name
                  : (line.depot as { name?: string } | null)?.name) ?? "-"}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatRate(Number(line.applied_takeover_price_per_tonne ?? 0))}
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
                {formatDate(line.purity_cert_date ?? line.line_date)}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatBags(Number(line.bags ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatTonnage3(Number(line.tonnage ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatRate(Number(line.applied_secondary_evac_cost_per_tonne ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.evacuation_cost ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.producer_price_value ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.buyers_margin_value ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.line_total ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-zinc-50 font-semibold">
            <td className="border border-zinc-200 px-2 py-1" colSpan={8}>
              TOTAL
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatBags(Number(computedTotals.totalBags))}
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatTonnage3(Number(computedTotals.totalTonnage))}
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">-</td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatMoney(Number(computedTotals.totalEvac))}
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatMoney(Number(computedTotals.totalProducer))}
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatMoney(Number(computedTotals.totalMargin))}
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatMoney(Number(computedTotals.grandTotal))}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="grid w-80 gap-1 rounded-md border border-zinc-200 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span>Total Bags</span>
          <span className="font-medium">{formatBags(Number(computedTotals.totalBags))}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Total Tonnage</span>
          <span className="font-medium">
            {formatTonnage3(Number(computedTotals.totalTonnage))}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-sm font-semibold">
          <span>Total Amount (GHS)</span>
          <span>{formatMoney(Number(computedTotals.grandTotal))}</span>
        </div>
      </div>

      <div className="pt-8 text-sm text-zinc-700">
        <div className="w-64 border-t border-zinc-400 pt-2">SNR. ACCOUNTS MANAGER</div>
      </div>
    </div>
  );
}
