import PrintButton from "@/components/print-button";
import { getCtroById } from "@/lib/data/ctro";
import { formatBags, formatMoney, formatTonnage } from "@/lib/format";
import { isSchemaCacheError, schemaCacheBannerMessage } from "@/lib/supabase/schema-cache";

export default async function CtroPrintInternalPage({
  params: rawParams,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const params =
    "then" in (rawParams as Promise<{ id: string }>)
      ? await (rawParams as Promise<{ id: string }>)
      : (rawParams as { id: string });
  let header: Awaited<ReturnType<typeof getCtroById>>["header"];
  let lines: Awaited<ReturnType<typeof getCtroById>>["lines"];
  let totals: Awaited<ReturnType<typeof getCtroById>>["totals"];
  try {
    const data = await getCtroById(params.id);
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
  const agent = Array.isArray(header.cocoa_agents) ? header.cocoa_agents[0] : header.cocoa_agents;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 text-sm text-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">CTRO Internal Print</h1>
          <p>CTRO No: {header.ctro_no}</p>
        </div>
        <PrintButton />
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div>Season: {header.season ?? "-"}</div>
        <div>Date: {header.ctro_date}</div>
        <div>Agent: {(agent as { name?: string } | null)?.name ?? "-"}</div>
        <div>Status: {header.status}</div>
        <div>Remarks: {header.remarks ?? "-"}</div>
      </div>

      <table className="w-full border-collapse border border-zinc-200 text-xs">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-200 px-2 py-1 text-left">Depot</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">TOD/Time</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Waybill</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">CTRO Ref</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">CWC</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Purity Cert</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Date</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Bags</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Tonnage</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Evacuation</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Producer Price</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Buyers Margin</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="border border-zinc-200 px-2 py-1">
                {(line.depot as { name?: string } | null)?.name ?? "-"}
              </td>
              <td className="border border-zinc-200 px-2 py-1">{line.tod_time ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.waybill_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.ctro_ref_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.cwc ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.purity_cert_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.line_date ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{formatBags(Number(line.bags ?? 0))}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{formatTonnage(Number(line.tonnage ?? 0))}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{formatMoney(Number(line.evacuation_cost ?? 0))}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{formatMoney(Number(line.producer_price_value ?? 0))}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{formatMoney(Number(line.buyers_margin_value ?? 0))}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{formatMoney(Number(line.line_total ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-2 md:grid-cols-3">
        <div>Total Bags: {formatBags(Number(totals?.total_bags ?? 0))}</div>
        <div>Total Tonnage: {formatTonnage(Number(totals?.total_tonnage ?? 0))}</div>
        <div>Total Evacuation: {formatMoney(Number(totals?.total_evacuation ?? 0))}</div>
        <div>Total Producer Price: {formatMoney(Number(totals?.total_producer_price ?? 0))}</div>
        <div>Total Buyers Margin: {formatMoney(Number(totals?.total_buyers_margin ?? 0))}</div>
        <div>Grand Total: {formatMoney(Number(totals?.grand_total ?? 0))}</div>
      </div>
    </div>
  );
}
