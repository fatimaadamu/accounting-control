"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type AccountOption = {
  id: string;
  code: string;
  name: string;
};

type LineInput = {
  account_id: string;
  description: string;
  quantity: string;
  unit_price: string;
};

type DocumentLinesFormProps = {
  accounts: AccountOption[];
  fieldName?: string;
};

const emptyLine = (): LineInput => ({
  account_id: "",
  description: "",
  quantity: "1",
  unit_price: "0",
});

export default function DocumentLinesForm({
  accounts,
  fieldName = "lines_json",
}: DocumentLinesFormProps) {
  const [lines, setLines] = React.useState<LineInput[]>([emptyLine()]);

  const updateLine = (index: number, update: Partial<LineInput>) => {
    setLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...update } : line
      )
    );
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, lineIndex) => lineIndex !== index));
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name={fieldName} value={JSON.stringify(lines)} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700">Lines</h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
        >
          Add line
        </Button>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div
            key={`doc-line-${index}`}
            className="grid gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-5"
          >
            <div className="space-y-1 md:col-span-2">
              <Label>Account</Label>
              <Select
                value={line.account_id}
                onChange={(event) =>
                  updateLine(index, { account_id: event.target.value })
                }
                required
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={line.description}
                onChange={(event) =>
                  updateLine(index, { description: event.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Qty</Label>
              <Input
                inputMode="decimal"
                value={line.quantity}
                onChange={(event) =>
                  updateLine(index, { quantity: event.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Unit price</Label>
              <Input
                inputMode="decimal"
                value={line.unit_price}
                onChange={(event) =>
                  updateLine(index, { unit_price: event.target.value })
                }
              />
            </div>
            <div className="md:col-span-5">
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeLine(index)}
                >
                  Remove line
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}