import PrintButton from "@/components/print-button";
import { ensureActiveCompanyId, requireCompanyAccess, requireUser } from "@/lib/auth";
import { getCtroById } from "@/lib/data/ctro";
import { formatBags, formatMoney, formatRate, formatTonnage } from "@/lib/format";
import { isSchemaCacheError, schemaCacheBannerMessage } from "@/lib/supabase/schema-cache";

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

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

  const companyName =
    (header.company as { name?: string } | null)?.name ??
    (header.company_id ? `Company ${header.company_id}` : "-");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 text-sm text-zinc-800">
      <style>{`
        @page {
          size: A4;
          margin: 16mm;
        }
        @media print {
          .print-hidden {
            display: none !important;
          }
          body {
            margin: 0;
          }
        }
      `}</style>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">COCOA MARKETING COMPANY</h1>
          <p className="text-sm font-medium">COCOA HOUSE - ACCRA</p>
          <p className="text-sm font-medium">COCOA TAKEN OVER RECEIPT (CTRO)</p>
          <div className="pt-2 text-xs text-zinc-700">
            <div>CTRO No: {header.ctro_no}</div>
            <div>Date: {formatDate(header.ctro_date)}</div>
            <div>Season: {header.season ?? "-"}</div>
            <div>Company: {companyName}</div>
          </div>
        </div>
        <div className="print-hidden">
          <PrintButton />
        </div>
      </div>

      <table className="w-full border-collapse border border-zinc-200 text-xs">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-200 px-2 py-1 text-left">Depot</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Take-over Centre</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Bags</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Tonnage</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Producer / Tonne
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Producer Value
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Evacuation / Tonne
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Evacuation Value
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Buyer Margin / Tonne
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Buyer Margin Value
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Take-over / Tonne
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Line Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
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
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatBags(Number(line.bags ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatTonnage(Number(line.tonnage ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatRate(Number(line.applied_producer_price_per_tonne ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.producer_price_value ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatRate(Number(line.applied_secondary_evac_cost_per_tonne ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.evacuation_cost ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatRate(Number(line.applied_buyer_margin_per_tonne ?? 0))}
              </td>
              <td className="border border-zinc-200 px-2 py-1 text-right">
                {formatMoney(Number(line.buyers_margin_value ?? 0))}
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
          <span className="font-medium">{formatBags(Number(computedTotals.totalBags))}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Total Tonnage</span>
          <span className="font-medium">
            {formatTonnage(Number(computedTotals.totalTonnage))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Total Producer Value</span>
          <span className="font-medium">
            {formatMoney(Number(computedTotals.totalProducer))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Total Evacuation Value</span>
          <span className="font-medium">
            {formatMoney(Number(computedTotals.totalEvac))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Total Buyer Margin Value</span>
          <span className="font-medium">
            {formatMoney(Number(computedTotals.totalMargin))}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-sm font-semibold">
          <span>GRAND TOTAL</span>
          <span>{formatMoney(Number(computedTotals.grandTotal))}</span>
        </div>
      </div>

      <div className="pt-8 text-sm text-zinc-700">
        <div className="w-64 border-t border-zinc-400 pt-2">SNR. ACCOUNTS MANAGER</div>
      </div>
    </div>
  );
}
