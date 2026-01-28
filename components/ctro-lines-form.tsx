"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type CtroLine = {
  district: string;
  tod_time: string;
  waybill_no: string;
  ctro_ref_no: string;
  cwc: string;
  purity_cert_no: string;
  line_date: string;
  bags: string;
  tonnage: string;
  evacuation_cost: string;
  evacuation_treatment: "company_paid" | "deducted";
  producer_price_value: string;
  buyers_margin_value: string;
};

type CtroLinesFormProps = {
  fieldName?: string;
};

const emptyLine = (): CtroLine => ({
  district: "",
  tod_time: "",
  waybill_no: "",
  ctro_ref_no: "",
  cwc: "",
  purity_cert_no: "",
  line_date: "",
  bags: "",
  tonnage: "",
  evacuation_cost: "",
  evacuation_treatment: "company_paid",
  producer_price_value: "",
  buyers_margin_value: "",
});

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function CtroLinesForm({ fieldName = "lines_json" }: CtroLinesFormProps) {
  const [lines, setLines] = React.useState<CtroLine[]>([emptyLine()]);

  const updateLine = (index: number, update: Partial<CtroLine>) => {
    setLines((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, ...update } : line))
    );
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const totals = lines.reduce(
    (acc, line) => {
      const bags = Number(line.bags) || 0;
      const tonnage = Number(line.tonnage) || 0;
      const evacuation = Number(line.evacuation_cost) || 0;
      const producer = Number(line.producer_price_value) || 0;
      const margin = Number(line.buyers_margin_value) || 0;
      const lineTotal = round2(evacuation + producer + margin);
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
      <input type="hidden" name={fieldName} value={JSON.stringify(lines)} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">CTRO Lines</h3>
        <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
          Add line
        </Button>
      </div>

      <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase text-zinc-400">Total Bags</p>
          <p className="font-semibold text-zinc-800">{totals.total_bags}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Total Tonnage</p>
          <p className="font-semibold text-zinc-800">{totals.total_tonnage.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Total Evacuation</p>
          <p className="font-semibold text-zinc-800">{round2(totals.total_evacuation).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Producer Price</p>
          <p className="font-semibold text-zinc-800">{round2(totals.total_producer_price).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Buyers Margin</p>
          <p className="font-semibold text-zinc-800">{round2(totals.total_buyers_margin).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Grand Total</p>
          <p className="font-semibold text-zinc-800">{round2(totals.grand_total).toFixed(2)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => {
          const lineTotal = round2(
            (Number(line.evacuation_cost) || 0) +
              (Number(line.producer_price_value) || 0) +
              (Number(line.buyers_margin_value) || 0)
          );

          return (
            <div key={`ctro-line-${index}`} className="rounded-md border border-zinc-200 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label>District</Label>
                  <Input value={line.district} onChange={(event) => updateLine(index, { district: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>TOD/Time</Label>
                  <Input value={line.tod_time} onChange={(event) => updateLine(index, { tod_time: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Waybill</Label>
                  <Input value={line.waybill_no} onChange={(event) => updateLine(index, { waybill_no: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>CTRO Ref No</Label>
                  <Input value={line.ctro_ref_no} onChange={(event) => updateLine(index, { ctro_ref_no: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>CWC</Label>
                  <Input value={line.cwc} onChange={(event) => updateLine(index, { cwc: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Purity Cert No</Label>
                  <Input value={line.purity_cert_no} onChange={(event) => updateLine(index, { purity_cert_no: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={line.line_date} onChange={(event) => updateLine(index, { line_date: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Bags</Label>
                  <Input inputMode="numeric" value={line.bags} onChange={(event) => updateLine(index, { bags: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Tonnage</Label>
                  <Input inputMode="decimal" value={line.tonnage} onChange={(event) => updateLine(index, { tonnage: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Evacuation Cost</Label>
                  <Input inputMode="decimal" value={line.evacuation_cost} onChange={(event) => updateLine(index, { evacuation_cost: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Evacuation Treatment</Label>
                  <Select
                    value={line.evacuation_treatment}
                    onChange={(event) =>
                      updateLine(index, { evacuation_treatment: event.target.value as CtroLine["evacuation_treatment"] })
                    }
                  >
                    <option value="company_paid">Company paid</option>
                    <option value="deducted">Deducted</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Producer Price</Label>
                  <Input inputMode="decimal" value={line.producer_price_value} onChange={(event) => updateLine(index, { producer_price_value: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Buyers Margin</Label>
                  <Input inputMode="decimal" value={line.buyers_margin_value} onChange={(event) => updateLine(index, { buyers_margin_value: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Line Total</Label>
                  <Input value={lineTotal.toFixed(2)} readOnly />
                </div>
              </div>
              {lines.length > 1 && (
                <div className="mt-3">
                  <Button type="button" variant="ghost" onClick={() => removeLine(index)}>
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
