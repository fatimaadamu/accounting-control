"use client";

import * as React from "react";

import CtroLinesForm from "@/components/ctro-lines-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Option = { id: string; name: string };
type DepotOption = Option & { region_id: string };

type RateCardLine = {
  region_id: string;
  district_id: string;
  depot_id: string | null;
  takeover_center_id: string;
  producer_price_per_tonne: number;
  buyer_margin_per_tonne: number;
  secondary_evac_cost_per_tonne: number;
  takeover_price_per_tonne: number;
};

type RateCardResponse = {
  rateCard: { id: string; bag_weight_kg: number } | null;
  lines: RateCardLine[];
};

type CtroCreateFormProps = {
  action: (formData: FormData) => void;
  periods: Array<{ id: string; period_month: number; period_year: number }>;
  agents: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; code: string; name: string }>;
  regions: Option[];
  depots: DepotOption[];
  centers: Option[];
};

export default function CtroCreateForm({
  action,
  periods,
  agents,
  accounts,
  regions,
  depots,
  centers,
}: CtroCreateFormProps) {
  const [ctroDate, setCtroDate] = React.useState("");
  const [rateCard, setRateCard] = React.useState<RateCardResponse | null>(null);
  const [rateCardStatus, setRateCardStatus] = React.useState<
    "ready" | "missing" | "loading"
  >("missing");

  React.useEffect(() => {
    const controller = new AbortController();
    const loadRateCard = async () => {
      if (!ctroDate) {
        setRateCard(null);
        setRateCardStatus("missing");
        return;
      }
      setRateCardStatus("loading");
      try {
        const response = await fetch(`/api/cocoa/rate-card?date=${ctroDate}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setRateCard(null);
          setRateCardStatus("missing");
          return;
        }
        const data = (await response.json()) as RateCardResponse;
        if (!data.rateCard) {
          setRateCard(null);
          setRateCardStatus("missing");
          return;
        }
        setRateCard(data);
        setRateCardStatus("ready");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setRateCard(null);
        setRateCardStatus("missing");
      }
    };
    loadRateCard();
    return () => {
      controller.abort();
    };
  }, [ctroDate]);

  const bagWeightKg = rateCard?.rateCard?.bag_weight_kg ?? 64;

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            name="ctro_date"
            type="date"
            required
            value={ctroDate}
            onChange={(event) => setCtroDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Season</Label>
          <Input name="season" placeholder="2025/2026" />
        </div>
        <div className="space-y-2">
          <Label>Period</Label>
          <Select name="period_id" required>
            <option value="">Select period</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.period_year}-{String(period.period_month).padStart(2, "0")}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Region (header)</Label>
          <Input name="region" />
        </div>
        <div className="space-y-2">
          <Label>Agent</Label>
          <Select name="agent_id">
            <option value="">Select agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Remarks</Label>
          <Input name="remarks" />
        </div>
        <div className="space-y-2">
          <Label>Evacuation paid via</Label>
          <Select name="evacuation_payment_mode">
            <option value="payable">Evacuation Payable</option>
            <option value="cash">Cash/Bank</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cash/Bank account</Label>
          <Select name="evacuation_cash_account_id">
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <CtroLinesForm
        regions={regions}
        depots={depots}
        centers={centers}
        bagWeightKg={bagWeightKg}
        rateCardLines={rateCard?.lines ?? []}
        rateCardStatus={rateCardStatus}
        headerDate={ctroDate}
      />

      <Button type="submit">Save draft</Button>
    </form>
  );
}
