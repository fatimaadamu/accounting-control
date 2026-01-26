"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type AllocationOption = {
  id: string;
  label: string;
  amount_due: number;
};

type AllocationInput = {
  doc_id: string;
  amount: string;
};

type AllocationsFormProps = {
  options: AllocationOption[];
  fieldName?: string;
};

const emptyAllocation = (): AllocationInput => ({ doc_id: "", amount: "" });

export default function AllocationsForm({
  options,
  fieldName = "allocations_json",
}: AllocationsFormProps) {
  const [rows, setRows] = React.useState<AllocationInput[]>([emptyAllocation()]);

  const updateRow = (index: number, update: Partial<AllocationInput>) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...update } : row
      )
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name={fieldName} value={JSON.stringify(rows)} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">Allocations</h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows((prev) => [...prev, emptyAllocation()])}
        >
          Add allocation
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={`alloc-${index}`}
            className="grid gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-3"
          >
            <div className="space-y-1 md:col-span-2">
              <Label>Document</Label>
              <Select
                value={row.doc_id}
                onChange={(event) => updateRow(index, { doc_id: event.target.value })}
              >
                <option value="">Select document</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} (Due {option.amount_due.toFixed(2)})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                value={row.amount}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              {rows.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => removeRow(index)}>
                  Remove allocation
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}