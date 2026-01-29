"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import ToastMessage from "@/components/toast-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

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

const selectValueClass = (value: string) =>
  value ? "text-red-600" : "text-zinc-500";

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
          <Select
            id="stock_field_account_id"
            name="stock_field_account_id"
            value={formState.stock_field_account_id}
            className={selectValueClass(formState.stock_field_account_id)}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                stock_field_account_id: event.target.value,
              }))
            }
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock_evac_account_id">Cocoa Stock - Evacuation</Label>
          <Select
            id="stock_evac_account_id"
            name="stock_evac_account_id"
            value={formState.stock_evac_account_id}
            className={selectValueClass(formState.stock_evac_account_id)}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                stock_evac_account_id: event.target.value,
              }))
            }
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock_margin_account_id">Cocoa Stock - Margin</Label>
          <Select
            id="stock_margin_account_id"
            name="stock_margin_account_id"
            value={formState.stock_margin_account_id}
            className={selectValueClass(formState.stock_margin_account_id)}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                stock_margin_account_id: event.target.value,
              }))
            }
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="advances_account_id">Advances to Agents</Label>
          <Select
            id="advances_account_id"
            name="advances_account_id"
            value={formState.advances_account_id}
            className={selectValueClass(formState.advances_account_id)}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                advances_account_id: event.target.value,
              }))
            }
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="buyer_margin_income_account_id">Buyer/LBC Margin Income</Label>
          <Select
            id="buyer_margin_income_account_id"
            name="buyer_margin_income_account_id"
            value={formState.buyer_margin_income_account_id}
            className={selectValueClass(formState.buyer_margin_income_account_id)}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                buyer_margin_income_account_id: event.target.value,
              }))
            }
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="evacuation_payable_account_id">CTRO Clearing / Payable</Label>
          <Select
            id="evacuation_payable_account_id"
            name="evacuation_payable_account_id"
            value={formState.evacuation_payable_account_id}
            className={selectValueClass(formState.evacuation_payable_account_id)}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                evacuation_payable_account_id: event.target.value,
              }))
            }
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </Select>
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
