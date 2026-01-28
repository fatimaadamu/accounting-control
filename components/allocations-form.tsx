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
  settlementAmountName?: string;
  whtAmountName?: string;
};

const emptyAllocation = (): AllocationInput => ({ doc_id: "", amount: "" });

export default function AllocationsForm({
  options,
  fieldName = "allocations_json",
  settlementAmountName,
  whtAmountName,
}: AllocationsFormProps) {
  const [rows, setRows] = React.useState<AllocationInput[]>([emptyAllocation()]);
  const [settlementValue, setSettlementValue] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);

  const updateRow = (index: number, update: Partial<AllocationInput>) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...update } : row
      )
    );
    setError(null);
  };

  const updateSettlementValue = React.useCallback(() => {
    if (!settlementAmountName) return;
    const form = document
      .querySelector(`input[name="${fieldName}"]`)
      ?.closest("form");
    if (!form) return;

    const amountInput = form.querySelector<HTMLInputElement>(
      `input[name="${settlementAmountName}"]`
    );
    const whtInput = whtAmountName
      ? form.querySelector<HTMLInputElement>(`input[name="${whtAmountName}"]`)
      : null;

    const amount = Number(amountInput?.value ?? 0) || 0;
    const wht = Number(whtInput?.value ?? 0) || 0;
    setSettlementValue(Math.round((amount + wht) * 100) / 100);
  }, [fieldName, settlementAmountName, whtAmountName]);

  const totalAllocated = rows.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
    setError(null);
  };

  React.useEffect(() => {
    const form = document
      .querySelector(`input[name="${fieldName}"]`)
      ?.closest("form");
    if (!form) return;

    updateSettlementValue();

    const amountInput = settlementAmountName
      ? form.querySelector<HTMLInputElement>(`input[name="${settlementAmountName}"]`)
      : null;
    const whtInput = whtAmountName
      ? form.querySelector<HTMLInputElement>(`input[name="${whtAmountName}"]`)
      : null;

    const handleInput = () => updateSettlementValue();
    amountInput?.addEventListener("input", handleInput);
    whtInput?.addEventListener("input", handleInput);

    const handleSubmit = (event: Event) => {
      const hasLine = rows.some((line) => {
        const amount = Number(line.amount) || 0;
        return line.doc_id && amount > 0;
      });

      if (!hasLine) {
        event.preventDefault();
        setError("Add at least one allocation with a document and amount.");
        return;
      }

      if (settlementAmountName && Math.abs(totalAllocated - settlementValue) > 0.009) {
        event.preventDefault();
        setError("Allocated total must equal settlement value.");
      }
    };

    form.addEventListener("submit", handleSubmit);
    return () => {
      form.removeEventListener("submit", handleSubmit);
      amountInput?.removeEventListener("input", handleInput);
      whtInput?.removeEventListener("input", handleInput);
    };
  }, [
    fieldName,
    rows,
    settlementAmountName,
    whtAmountName,
    settlementValue,
    totalAllocated,
    updateSettlementValue,
  ]);

  const allocateFullBalance = () => {
    setRows((prev) =>
      prev.map((row) => {
        const option = options.find((item) => item.id === row.doc_id);
        if (!option) return row;
        return { ...row, amount: option.amount_due.toFixed(2) };
      })
    );
    setError(null);
  };

  const clearAllocations = () => {
    setRows([emptyAllocation()]);
    setError(null);
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

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-600 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase text-zinc-400">Settlement value</p>
          <p className="font-semibold text-zinc-800">{settlementValue.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Allocated total</p>
          <p className="font-semibold text-zinc-800">{totalAllocated.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-zinc-400">Remaining</p>
          <p className="font-semibold text-zinc-800">
            {(settlementValue - totalAllocated).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={allocateFullBalance}>
          Allocate full balance
        </Button>
        <Button type="button" variant="ghost" onClick={clearAllocations}>
          Clear allocations
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
                onChange={(event) => {
                  const nextId = event.target.value;
                  const match = options.find((option) => option.id === nextId);
                  updateRow(index, {
                    doc_id: nextId,
                    amount: match ? match.amount_due.toFixed(2) : row.amount,
                  });
                }}
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
