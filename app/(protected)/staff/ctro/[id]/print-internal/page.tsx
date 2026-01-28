import PrintButton from "@/components/print-button";
import { getCtroById } from "@/lib/data/ctro";

export default async function CtroPrintInternalPage({
  params,
}: {
  params: { id: string };
}) {
  const { header, lines, totals } = await getCtroById(params.id);
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
        <div>Region: {header.region ?? "-"}</div>
        <div>Agent: {(agent as { name?: string } | null)?.name ?? "-"}</div>
        <div>Status: {header.status}</div>
        <div>Remarks: {header.remarks ?? "-"}</div>
      </div>

      <table className="w-full border-collapse border border-zinc-200 text-xs">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-200 px-2 py-1 text-left">District</th>
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
              <td className="border border-zinc-200 px-2 py-1">{line.district ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.tod_time ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.waybill_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.ctro_ref_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.cwc ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.purity_cert_no ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1">{line.line_date ?? "-"}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{line.bags ?? 0}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{Number(line.tonnage ?? 0).toFixed(3)}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{Number(line.evacuation_cost ?? 0).toFixed(2)}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{Number(line.producer_price_value ?? 0).toFixed(2)}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{Number(line.buyers_margin_value ?? 0).toFixed(2)}</td>
              <td className="border border-zinc-200 px-2 py-1 text-right">{Number(line.line_total ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-2 md:grid-cols-3">
        <div>Total Bags: {totals?.total_bags ?? 0}</div>
        <div>Total Tonnage: {Number(totals?.total_tonnage ?? 0).toFixed(3)}</div>
        <div>Total Evacuation: {Number(totals?.total_evacuation ?? 0).toFixed(2)}</div>
        <div>Total Producer Price: {Number(totals?.total_producer_price ?? 0).toFixed(2)}</div>
        <div>Total Buyers Margin: {Number(totals?.total_buyers_margin ?? 0).toFixed(2)}</div>
        <div>Grand Total: {Number(totals?.grand_total ?? 0).toFixed(2)}</div>
      </div>
    </div>
  );
}
