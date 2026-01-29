"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import ToastMessage from "@/components/toast-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  code: string;
  name: string;
};

type CocoaAccountConfig = {
  stock_field_account_id: string | null;
  stock_evac_account_id: string | null;
  stock_margin_account_id: string | null;
  advances_account_id: string | null;
  buyer_margin_income_account_id: string | null;
  evacuation_payable_account_id: string | null;
} | null;

type CocoaAccountsFormProps = {
  action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
  accounts: Account[];
  config: CocoaAccountConfig;
};

type CocoaAccountsFormState = {
  stock_field_account_id: string;
  stock_evac_account_id: string;
  stock_margin_account_id: string;
  advances_account_id: string;
  buyer_margin_income_account_id: string;
  evacuation_payable_account_id: string;
};

const selectValueClass = (value: string) => (value ? "text-red-600" : "text-zinc-500");

type SelectOption = {
  value: string;
  label: string;
};

type BoxSelectProps = {
  id: string;
  name: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onChange: (value: string) => void;
};

const BoxSelect = ({ id, name, value, placeholder, options, onChange }: BoxSelectProps) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label;

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-sm",
          "focus:border-zinc-900 focus:outline-none"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectValueClass(value)}>
          {selectedLabel ?? placeholder}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-4 w-4 text-zinc-500"
        >
          <path
            fill="currentColor"
            d="M5.5 7.5 10 12l4.5-4.5 1.5 1.5-6 6-6-6z"
          />
        </svg>
      </button>
      {open && (
        <div
          className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-sm"
          role="listbox"
          aria-labelledby={id}
        >
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            role="option"
            aria-selected={value === ""}
            className={cn(
              "flex w-full items-center px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50"
            )}
          >
            {placeholder}
          </button>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-zinc-50",
                  isSelected ? "text-red-600 font-medium" : "text-zinc-700"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function CocoaAccountsForm({
  action,
  accounts,
  config,
}: CocoaAccountsFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [toast, setToast] = React.useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );
  const [formState, setFormState] = React.useState<CocoaAccountsFormState>({
    stock_field_account_id: config?.stock_field_account_id ?? "",
    stock_evac_account_id: config?.stock_evac_account_id ?? "",
    stock_margin_account_id: config?.stock_margin_account_id ?? "",
    advances_account_id: config?.advances_account_id ?? "",
    buyer_margin_income_account_id: config?.buyer_margin_income_account_id ?? "",
    evacuation_payable_account_id: config?.evacuation_payable_account_id ?? "",
  });

  React.useEffect(() => {
    setFormState({
      stock_field_account_id: config?.stock_field_account_id ?? "",
      stock_evac_account_id: config?.stock_evac_account_id ?? "",
      stock_margin_account_id: config?.stock_margin_account_id ?? "",
      advances_account_id: config?.advances_account_id ?? "",
      buyer_margin_income_account_id: config?.buyer_margin_income_account_id ?? "",
      evacuation_payable_account_id: config?.evacuation_payable_account_id ?? "",
    });
  }, [config]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setToast(null);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await action(formData);
      if (result.ok) {
        setToast({ kind: "success", message: result.message ?? "Cocoa accounts saved." });
        router.refresh();
      } else {
        setToast({ kind: "error", message: result.message ?? "Unable to save cocoa accounts." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save cocoa accounts.";
      setToast({ kind: "error", message });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && <ToastMessage kind={toast.kind} message={toast.message} />}
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stock_field_account_id">Cocoa Stock - Field</Label>
          <BoxSelect
            id="stock_field_account_id"
            name="stock_field_account_id"
            value={formState.stock_field_account_id}
            placeholder="Select account"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
            onChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                stock_field_account_id: value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock_evac_account_id">Cocoa Stock - Evacuation</Label>
          <BoxSelect
            id="stock_evac_account_id"
            name="stock_evac_account_id"
            value={formState.stock_evac_account_id}
            placeholder="Select account"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
            onChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                stock_evac_account_id: value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock_margin_account_id">Cocoa Stock - Margin</Label>
          <BoxSelect
            id="stock_margin_account_id"
            name="stock_margin_account_id"
            value={formState.stock_margin_account_id}
            placeholder="Select account"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
            onChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                stock_margin_account_id: value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="advances_account_id">Advances to Agents</Label>
          <BoxSelect
            id="advances_account_id"
            name="advances_account_id"
            value={formState.advances_account_id}
            placeholder="Select account"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
            onChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                advances_account_id: value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="buyer_margin_income_account_id">Buyer/LBC Margin Income</Label>
          <BoxSelect
            id="buyer_margin_income_account_id"
            name="buyer_margin_income_account_id"
            value={formState.buyer_margin_income_account_id}
            placeholder="Select account"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
            onChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                buyer_margin_income_account_id: value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="evacuation_payable_account_id">CTRO Clearing / Payable</Label>
          <BoxSelect
            id="evacuation_payable_account_id"
            name="evacuation_payable_account_id"
            value={formState.evacuation_payable_account_id}
            placeholder="Select account"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.code} - ${account.name}`,
            }))}
            onChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                evacuation_payable_account_id: value,
              }))
            }
          />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save cocoa accounts"}
          </Button>
        </div>
      </form>
    </div>
  );
}
