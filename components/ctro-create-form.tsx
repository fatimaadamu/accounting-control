"use client";

import * as React from "react";

import CtroLinesForm from "@/components/ctro-lines-form";
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
  takeover_price_per_tonne: number;
};

type RateCardResponse = {
  rateCard: { id: string; bag_weight_kg: number; bags_per_tonne?: number | null; season: string | null } | null;
  lines: RateCardLine[];
  message?: string | null;
};

type CtroCreateFormProps = {
  action: (formData: FormData) => void;
  periods: Array<{
    id: string;
    period_month: number;
    period_year: number;
    start_date: string;
    end_date: string;
  }>;
  depots: Option[];
  centers: Option[];
};

export default function CtroCreateForm({
  action,
  periods,
  depots,
  centers,
}: CtroCreateFormProps) {
  const [ctroDate, setCtroDate] = React.useState("");
  const [rateCard, setRateCard] = React.useState<RateCardResponse | null>(null);
  const [rateCardStatus, setRateCardStatus] = React.useState<
    "ready" | "missing" | "loading"
  >("missing");
  const [rateCardMessage, setRateCardMessage] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    const loadRateCard = async () => {
      if (!ctroDate) {
        setRateCard(null);
        setRateCardStatus("missing");
        setRateCardMessage(null);
        return;
      }
      setRateCardStatus("loading");
      setRateCardMessage(null);
      try {
        const response = await fetch(`/api/cocoa/rate-card?date=${ctroDate}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setRateCard(null);
          setRateCardStatus("missing");
          setRateCardMessage("No rate card found for this date.");
          return;
        }
        const data = (await response.json()) as RateCardResponse;
        if (!data.rateCard) {
          setRateCard(null);
          setRateCardStatus("missing");
          setRateCardMessage(data.message ?? "No rate card found for this date.");
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
        setRateCardMessage("Unable to load rate card.");
      }
    };
    loadRateCard();
    return () => {
      controller.abort();
    };
  }, [ctroDate]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const bagsPerTonne = rateCard?.rateCard?.bags_per_tonne ?? 16;
  const season = rateCard?.rateCard?.season ?? "";
  const canSubmit = Boolean(ctroDate) && rateCardStatus === "ready";
  const submitDisabled = mounted ? !canSubmit : undefined;
  const period = React.useMemo(() => {
    if (!ctroDate) {
      return null;
    }
    const dateValue = new Date(ctroDate);
    return (
      periods.find((item) => {
        const start = new Date(item.start_date);
        const end = new Date(item.end_date);
        return dateValue >= start && dateValue <= end;
      }) ?? null
    );
  }, [ctroDate, periods]);

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
          <Input name="season" value={season} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Period</Label>
          <Input
            value={
              period
                ? `${period.period_year}-${String(period.period_month).padStart(2, "0")}`
                : ""
            }
            readOnly
          />
          <input type="hidden" name="period_id" value={period?.id ?? ""} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Remarks</Label>
          <Input name="remarks" />
        </div>
      </div>

      <CtroLinesForm
        depots={depots}
        centers={centers}
        bagsPerTonne={bagsPerTonne}
        rateCardLines={rateCard?.lines ?? []}
        rateCardStatus={rateCardStatus}
        missingMessage={rateCardMessage}
        headerDate={ctroDate}
      />

      <Button type="submit" disabled={submitDisabled}>
        Save draft
      </Button>
    </form>
  );
}
