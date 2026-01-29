"use client";

import * as React from "react";

import { formatBags, formatMoney, formatRate, formatTonnage } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Option = { id: string; name: string };

type DepotOption = Option;

type RateCardLine = {
  depot_id: string | null;
  takeover_center_id: string;
  producer_price_per_tonne: number;
  buyer_margin_per_tonne: number;
  secondary_evac_cost_per_tonne: number;
  takeover_price_per_tonne?: number | null;
};

type CtroLine = {
  depot_id: string;
  takeover_center_id: string;
  tod_time: string;
  waybill_no: string;
  ctro_ref_no: string;
  cwc: string;
  purity_cert_no: string;
  bags: string;
  bag_weight_kg: string;
  tonnage: string;
  applied_producer_price_per_tonne: string;
  applied_buyer_margin_per_tonne: string;
  applied_secondary_evac_cost_per_tonne: string;
  applied_takeover_price_per_tonne: string;
  producer_price_value: string;
  buyers_margin_value: string;
  evacuation_cost: string;
  line_total: string;
  evacuation_treatment: "company_paid" | "deducted";
};

type CtroLinesFormProps = {
  fieldName?: string;
  depots: DepotOption[];
  centers: Option[];
  bagsPerTonne: number;
  rateCardLines: RateCardLine[];
  rateCardStatus: "ready" | "missing" | "loading";
  missingMessage?: string | null;
  headerDate?: string;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const parseNumber = (value: string | number | null | undefined) => {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const emptyLine = (bagsPerTonne: number): CtroLine => ({
  depot_id: "",
  takeover_center_id: "",
  tod_time: "",
  waybill_no: "",
  ctro_ref_no: "",
  cwc: "",
  purity_cert_no: "",
  bags: "",
  bag_weight_kg: bagsPerTonne.toString(),
  tonnage: "",
  applied_producer_price_per_tonne: "",
  applied_buyer_margin_per_tonne: "",
  applied_secondary_evac_cost_per_tonne: "",
  applied_takeover_price_per_tonne: "",
  producer_price_value: "",
  buyers_margin_value: "",
  evacuation_cost: "",
  line_total: "",
  evacuation_treatment: "company_paid",
});


export default function CtroLinesForm({
  fieldName = "lines_json",
  depots,
  centers,
  bagsPerTonne,
  rateCardLines,
  rateCardStatus,
  missingMessage,
  headerDate,
}: CtroLinesFormProps) {
  const [lines, setLines] = React.useState<CtroLine[]>([emptyLine(bagsPerTonne)]);
  const canEditLines = Boolean(headerDate);

  const findRateCardLine = React.useCallback(
    (line: CtroLine) => {
      if (!line.depot_id || !line.takeover_center_id) {
        return null;
      }

      const depotId = line.depot_id || null;
      const exact = rateCardLines.find(
        (item) =>
          (item.depot_id ?? null) === depotId &&
          item.takeover_center_id === line.takeover_center_id
      );

      return exact ?? null;
    },
    [rateCardLines]
  );

  const recalcLine = React.useCallback(
    (line: CtroLine) => {
      const bags = Number(line.bags || 0);
      const rawTonnage = bagsPerTonne ? bags / bagsPerTonne : 0;
      const displayTonnage = round3(rawTonnage);

      const rateLine = findRateCardLine(line);
      const producerRate = rateLine?.producer_price_per_tonne ?? 0;
      const marginRate = rateLine?.buyer_margin_per_tonne ?? 0;
      const evacRate = rateLine?.secondary_evac_cost_per_tonne ?? 0;
      const takeoverRate = rateLine?.takeover_price_per_tonne ?? 0;

      const producerValue = round2(rawTonnage * producerRate);
      const marginValue = round2(rawTonnage * marginRate);
      const evacuationValue = round2(rawTonnage * evacRate);
      const lineTotal = round2(rawTonnage * takeoverRate);

      return {
        ...line,
        bag_weight_kg: bagsPerTonne.toString(),
        tonnage: formatTonnage(displayTonnage),
        applied_producer_price_per_tonne: formatRate(producerRate),
        applied_buyer_margin_per_tonne: formatRate(marginRate),
        applied_secondary_evac_cost_per_tonne: formatRate(evacRate),
        applied_takeover_price_per_tonne: formatRate(takeoverRate),
        producer_price_value: formatMoney(producerValue),
        buyers_margin_value: formatMoney(marginValue),
        evacuation_cost: formatMoney(evacuationValue),
        line_total: formatMoney(lineTotal),
      };
    },
    [bagsPerTonne, findRateCardLine]
  );

  const updateLine = (index: number, update: Partial<CtroLine>) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) {
          return line;
        }
        const next = { ...line, ...update };
        return recalcLine(next);
      })
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, recalcLine(emptyLine(bagsPerTonne))]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  React.useEffect(() => {
    setLines((prev) => prev.map((line) => recalcLine(line)));
  }, [bagsPerTonne, rateCardLines, recalcLine]);

  const totals = lines.reduce(
    (acc, line) => {
      if (!line.depot_id || !line.takeover_center_id || parseNumber(line.bags) <= 0) {
        return acc;
      }
      const bags = parseNumber(line.bags);
      const tonnage = parseNumber(line.tonnage);
      const evacuation = parseNumber(line.evacuation_cost);
      const producer = parseNumber(line.producer_price_value);
      const margin = parseNumber(line.buyers_margin_value);
      const lineTotal = round2(parseNumber(line.line_total));
      acc.total_bags += bags;
      acc.total_tonnage += tonnage;
      acc.total_evacuation += evacuation;
      acc.total_producer_price += producer;
      acc.total_buyers_margin += margin;
      acc.grand_total += lineTotal;
      return acc;
    },
    {
      total_bags: 0,
      total_tonnage: 0,
      total_evacuation: 0,
      total_producer_price: 0,
      total_buyers_margin: 0,
      grand_total: 0,
    }
  );

  return (
    <div className="space-y-4">
      <input
        type="hidden"
        name={fieldName}
        value={JSON.stringify(canEditLines ? lines : [])}
      />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">CTRO Lines</h3>
        <Button type="button" variant="secondary" onClick={addLine} disabled={!canEditLines}>
          Add line
        </Button>
      </div>

      {!canEditLines && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Select CTRO Date to apply rate card.
        </div>
      )}

      {canEditLines && rateCardStatus === "loading" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Loading rate card...
        </div>
      )}

      {canEditLines && rateCardStatus === "missing" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {missingMessage ?? "No rate card found for this date. Please add a rate card in Admin."}
        </div>
      )}

      <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase text-zinc-400">Total Bags</p>
          <p className="font-semibold text-zinc-800">{formatBags(totals.total_bags)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Total Tonnage</p>
          <p className="font-semibold text-zinc-800">{formatTonnage(totals.total_tonnage)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Total Evacuation</p>
          <p className="font-semibold text-zinc-800">{formatMoney(totals.total_evacuation)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Producer Price</p>
          <p className="font-semibold text-zinc-800">{formatMoney(totals.total_producer_price)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Buyers Margin</p>
          <p className="font-semibold text-zinc-800">{formatMoney(totals.total_buyers_margin)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Grand Total</p>
          <p className="font-semibold text-zinc-800">{formatMoney(totals.grand_total)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const availableDepots = depots;
          const hasSelections = Boolean(line.depot_id && line.takeover_center_id);
          const matchedRate = findRateCardLine(line);
          const showMissingRate =
            canEditLines && rateCardStatus === "ready" && hasSelections && !matchedRate;

          return (
            <div key={`ctro-line-${index}`} className="rounded-md border border-zinc-200 p-4">
              {showMissingRate && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  No published rate found for this depot + takeover center on this date.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label>Depot</Label>
                  <Select
                    value={line.depot_id}
                    onChange={(event) =>
                      updateLine(index, {
                        depot_id: event.target.value,
                        takeover_center_id: "",
                      })
                    }
                    disabled={!canEditLines}
                    required
                  >
                    <option value="">Select depot</option>
                    {availableDepots.map((depot) => (
                      <option key={depot.id} value={depot.id}>
                        {depot.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Takeover Center</Label>
                  <Select
                    value={line.takeover_center_id}
                    onChange={(event) => updateLine(index, { takeover_center_id: event.target.value })}
                    disabled={!canEditLines}
                    required
                  >
                    <option value="">Select center</option>
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>TOD/Time</Label>
                  <Input
                    value={line.tod_time}
                    onChange={(event) => updateLine(index, { tod_time: event.target.value })}
                    disabled={!canEditLines}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Waybill</Label>
                  <Input
                    value={line.waybill_no}
                    onChange={(event) => updateLine(index, { waybill_no: event.target.value })}
                    disabled={!canEditLines}
                  />
                </div>
                <div className="space-y-1">
                  <Label>CTRO Ref No</Label>
                  <Input
                    value={line.ctro_ref_no}
                    onChange={(event) => updateLine(index, { ctro_ref_no: event.target.value })}
                    disabled={!canEditLines}
                  />
                </div>
                <div className="space-y-1">
                  <Label>CWC</Label>
                  <Input
                    value={line.cwc}
                    onChange={(event) => updateLine(index, { cwc: event.target.value })}
                    disabled={!canEditLines}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Purity Cert No</Label>
                  <Input
                    value={line.purity_cert_no}
                    onChange={(event) => updateLine(index, { purity_cert_no: event.target.value })}
                    disabled={!canEditLines}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Bags</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    required
                    value={line.bags}
                    onChange={(event) => updateLine(index, { bags: event.target.value })}
                    disabled={!canEditLines}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tonnage</Label>
                  <Input value={line.tonnage} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Producer / tonne</Label>
                  <Input value={line.applied_producer_price_per_tonne} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Margin / tonne</Label>
                  <Input value={line.applied_buyer_margin_per_tonne} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Evacuation / tonne</Label>
                  <Input value={line.applied_secondary_evac_cost_per_tonne} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Evacuation Value</Label>
                  <Input value={line.evacuation_cost} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Producer Value</Label>
                  <Input value={line.producer_price_value} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Buyers Margin Value</Label>
                  <Input value={line.buyers_margin_value} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Evacuation Treatment</Label>
                  <Select
                    value={line.evacuation_treatment}
                    onChange={(event) =>
                      updateLine(index, { evacuation_treatment: event.target.value as CtroLine["evacuation_treatment"] })
                    }
                    disabled={!canEditLines}
                  >
                    <option value="company_paid">Company paid</option>
                    <option value="deducted">Deducted</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Line Total</Label>
                  <Input value={line.line_total} readOnly />
                </div>
              </div>
              {lines.length > 1 && (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeLine(index)}
                    disabled={!canEditLines}
                  >
                    Remove line
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
