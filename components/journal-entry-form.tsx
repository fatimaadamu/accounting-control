"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type JournalAccountOption = {
  id: string;
  code: string;
  name: string;
};

export type JournalPeriodOption = {
  id: string;
  label: string;
};

type JournalLineInput = {
  account_id: string;
  debit: string;
  credit: string;
};

type JournalEntryFormProps = {
  accounts: JournalAccountOption[];
  periods: JournalPeriodOption[];
  companyId: string;
};

const emptyLine = (): JournalLineInput => ({
  account_id: "",
  debit: "",
  credit: "",
});

export default function JournalEntryForm({
  accounts,
  periods,
  companyId,
}: JournalEntryFormProps) {
  const [lines, setLines] = React.useState<JournalLineInput[]>([emptyLine()]);

  const updateLine = (index: number, update: Partial<JournalLineInput>) => {
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
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="lines_json" value={JSON.stringify(lines)} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="period_id">Period</Label>
          <Select id="period_id" name="period_id" required>
            <option value="">Select period</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="entry_date">Entry date</Label>
          <Input id="entry_date" name="entry_date" type="date" required />
        </div>
        <div className="space-y-2 md:col-span-3">
          <Label htmlFor="narration">Narration</Label>
          <Textarea id="narration" name="narration" required />
        </div>
      </div>

      <div className="space-y-3">
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
              key={`line-${index}`}
              className="grid gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-4"
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
                <Label>Debit</Label>
                <Input
                  inputMode="decimal"
                  value={line.debit}
                  onChange={(event) =>
                    updateLine(index, { debit: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Credit</Label>
                <Input
                  inputMode="decimal"
                  value={line.credit}
                  onChange={(event) =>
                    updateLine(index, { credit: event.target.value })
                  }
                />
              </div>
              <div className="md:col-span-4">
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
    </div>
  );
}