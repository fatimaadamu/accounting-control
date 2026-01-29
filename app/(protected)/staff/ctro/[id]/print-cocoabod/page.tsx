import PrintButton from "@/components/print-button";
import { getCtroById } from "@/lib/data/ctro";
import { formatBags, formatMoney, formatRate, formatTonnage } from "@/lib/format";

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
  params,
}: {
  params: { id: string };
}) {
  const { header, lines, totals } = await getCtroById(params.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 text-sm text-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">COCOA MARKETING COMPANY</h1>
          <p className="text-sm font-medium">COCOA HOUSE – ACCRA</p>
          <p className="text-sm font-medium">DATE: {formatDate(header.ctro_date)}</p>
        </div>
        <PrintButton />
      </div>

      <table className="w-full border-collapse border border-zinc-200 text-xs">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-200 px-2 py-1 text-left">Depot</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Takeover Center</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Waybill No</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">CTRO No</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">CWC</th>
            <th className="border border-zinc-200 px-2 py-1 text-left">Purity Certificate</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Bags</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Tonnage</th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Secondary Evac Cost / Tonne
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">
              Takeover Price / Tonne
            </th>
            <th className="border border-zinc-200 px-2 py-1 text-right">Line Total</th>
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
              <td className="border border-zinc-200 px-2 py-1">{line.waybill_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{header.ctro_no}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.cwc ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">
                {line.purity_cert_no ?? "-"}
              </td>
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
        <tfoot>
          <tr className="bg-zinc-50">
            <td className="border border-zinc-200 px-2 py-1" colSpan={6}>
              Totals
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatBags(Number(totals?.total_bags ?? 0))}
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right">
              {formatTonnage(Number(totals?.total_tonnage ?? 0))}
            </td>
            <td className="border border-zinc-200 px-2 py-1 text-right" colSpan={3}>
              {formatMoney(Number(totals?.grand_total ?? 0))}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="pt-8 text-sm text-zinc-700">
        <div className="w-64 border-t border-zinc-400 pt-2">SNR. ACCOUNTS MANAGER</div>
      </div>
    </div>
  );
}
