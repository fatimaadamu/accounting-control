import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ToastMessage from "@/components/toast-message";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const parseCsv = (raw: string) =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));

export default async function CocoaRateCardsPage({
  searchParams,
}: {
  searchParams?: Promise<{ rate_card_id?: string; toast?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedRateCardId = resolvedSearchParams?.rate_card_id ?? "";

  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/admin/cocoa/rate-cards");

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rate cards</CardTitle>
          <CardDescription>No companies assigned. Ask an admin to grant access.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);

  const { data: rateCards, error: rateCardError } = await supabaseAdmin()
    .from("cocoa_rate_cards")
    .select("id, season, effective_from, effective_to, bag_weight_kg")
    .eq("company_id", companyId)
    .order("effective_from", { ascending: false });

  if (rateCardError) {
    throw new Error(rateCardError.message);
  }

  const rateCardId = selectedRateCardId || rateCards?.[0]?.id || "";

  const { data: regions, error: regionError } = await supabaseAdmin()
    .from("cocoa_regions")
    .select("id, name")
    .order("name");

  if (regionError) {
    throw new Error(regionError.message);
  }

  const { data: districts, error: districtError } = await supabaseAdmin()
    .from("cocoa_districts")
    .select("id, name, region_id")
    .order("name");

  if (districtError) {
    throw new Error(districtError.message);
  }

  const { data: depots, error: depotError } = await supabaseAdmin()
    .from("cocoa_depots")
    .select("id, name, district_id")
    .order("name");

  if (depotError) {
    throw new Error(depotError.message);
  }

  const { data: centers, error: centerError } = await supabaseAdmin()
    .from("takeover_centers")
    .select("id, name")
    .order("name");

  if (centerError) {
    throw new Error(centerError.message);
  }

  const { data: lines, error: linesError } = rateCardId
    ? await supabaseAdmin()
        .from("cocoa_rate_card_lines")
        .select(
          "id, rate_card_id, region_id, district_id, depot_id, takeover_center_id, producer_price_per_tonne, buyer_margin_per_tonne, secondary_evac_cost_per_tonne, takeover_price_per_tonne"
        )
        .eq("rate_card_id", rateCardId)
    : { data: [], error: null };

  if (linesError) {
    throw new Error(linesError.message);
  }

  async function createRateCardAction(formData: FormData) {
    "use server";
    const season = String(formData.get("season") ?? "").trim();
    const effectiveFrom = String(formData.get("effective_from") ?? "");
    const effectiveTo = String(formData.get("effective_to") ?? "") || null;
    const bagWeightKg = Number(formData.get("bag_weight_kg") ?? 64);

    if (!season || !effectiveFrom) {
      throw new Error("Season and effective from date are required.");
    }

    const { error } = await supabaseAdmin()
      .from("cocoa_rate_cards")
      .insert({
        company_id: companyId,
        season,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        bag_weight_kg: bagWeightKg || 64,
      });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/cocoa/rate-cards");
  }

  async function deleteRateCardAction(formData: FormData) {
    "use server";
    const id = String(formData.get("rate_card_id") ?? "");
    const { error } = await supabaseAdmin().from("cocoa_rate_cards").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/rate-cards");
  }

  async function createLineAction(formData: FormData) {
    "use server";
    const rateCardIdValue = String(formData.get("rate_card_id") ?? "");
    const regionId = String(formData.get("region_id") ?? "");
    const districtId = String(formData.get("district_id") ?? "");
    const depotId = String(formData.get("depot_id") ?? "") || null;
    const takeoverCenterId = String(formData.get("takeover_center_id") ?? "");
    const producerPrice = Number(formData.get("producer_price_per_tonne") ?? 0);
    const buyerMargin = Number(formData.get("buyer_margin_per_tonne") ?? 0);
    const secondaryEvac = Number(formData.get("secondary_evac_cost_per_tonne") ?? 0);
    const takeoverPrice = producerPrice + buyerMargin + secondaryEvac;

    if (!rateCardIdValue || !regionId || !districtId || !takeoverCenterId) {
      throw new Error("Rate card, region, district, and takeover center are required.");
    }

    const { error } = await supabaseAdmin()
      .from("cocoa_rate_card_lines")
      .insert({
        rate_card_id: rateCardIdValue,
        region_id: regionId,
        district_id: districtId,
        depot_id: depotId,
        takeover_center_id: takeoverCenterId,
        producer_price_per_tonne: producerPrice,
        buyer_margin_per_tonne: buyerMargin,
        secondary_evac_cost_per_tonne: secondaryEvac,
        takeover_price_per_tonne: takeoverPrice,
      });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/cocoa/rate-cards");
  }

  async function deleteLineAction(formData: FormData) {
    "use server";
    const id = String(formData.get("line_id") ?? "");
    const { error } = await supabaseAdmin().from("cocoa_rate_card_lines").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/rate-cards");
  }

  async function importCsvAction(formData: FormData) {
    "use server";
    const rateCardIdValue = String(formData.get("rate_card_id") ?? "");
    const csv = String(formData.get("csv") ?? "").trim();

    if (!rateCardIdValue || !csv) {
      const message = "Rate card and CSV data are required.";
      const query = new URLSearchParams({
        toast: "error",
        message,
        ...(rateCardIdValue ? { rate_card_id: rateCardIdValue } : {}),
      });
      redirect(`/admin/cocoa/rate-cards?${query.toString()}`);
    }

    const regionMap = new Map(regions.map((region) => [region.name.toLowerCase(), region.id]));
    const districtMap = new Map(districts.map((district) => [district.name.toLowerCase(), district.id]));
    const depotMap = new Map(depots.map((depot) => [depot.name.toLowerCase(), depot.id]));
    const centerMap = new Map(centers.map((center) => [center.name.toLowerCase(), center.id]));

    const rows = parseCsv(csv);
    const payload = rows.map((cells, index) => {
      const [
        regionName,
        districtName,
        depotName,
        centerName,
        producer,
        margin,
        evac,
      ] = cells;

      const regionId = regionMap.get((regionName ?? "").toLowerCase());
      const districtId = districtMap.get((districtName ?? "").toLowerCase());
      const depotId = depotName ? depotMap.get(depotName.toLowerCase()) ?? null : null;
      const centerId = centerMap.get((centerName ?? "").toLowerCase());

      if (!regionId || !districtId || !centerId) {
        const message = `CSV row ${index + 1} has invalid region/district/center.`;
        const query = new URLSearchParams({
          toast: "error",
          message,
          rate_card_id: rateCardIdValue,
        });
        redirect(`/admin/cocoa/rate-cards?${query.toString()}`);
      }

      const producerPrice = Number(producer ?? 0);
      const buyerMargin = Number(margin ?? 0);
      const secondaryEvac = Number(evac ?? 0);
      const takeoverPrice = producerPrice + buyerMargin + secondaryEvac;

      return {
        rate_card_id: rateCardIdValue,
        region_id: regionId,
        district_id: districtId,
        depot_id: depotId,
        takeover_center_id: centerId,
        producer_price_per_tonne: producerPrice,
        buyer_margin_per_tonne: buyerMargin,
        secondary_evac_cost_per_tonne: secondaryEvac,
        takeover_price_per_tonne: takeoverPrice,
      };
    });

    const { error } = await supabaseAdmin().from("cocoa_rate_card_lines").insert(payload);
    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/cocoa/rate-cards");
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={resolvedSearchParams.message ?? "Action completed"}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Rate cards</CardTitle>
          <CardDescription>Effective dated rate cards for cocoa pricing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createRateCardAction} className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Season</Label>
              <Input name="season" placeholder="2025/2026" required />
            </div>
            <div className="space-y-2">
              <Label>Effective from</Label>
              <Input name="effective_from" type="date" required />
            </div>
            <div className="space-y-2">
              <Label>Effective to</Label>
              <Input name="effective_to" type="date" />
            </div>
            <div className="space-y-2">
              <Label>Bag weight (kg)</Label>
              <Input name="bag_weight_kg" type="number" step="0.01" defaultValue={64} />
            </div>
            <div className="md:col-span-4">
              <Button type="submit">Create rate card</Button>
            </div>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Season</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Bag weight</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rateCards ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-zinc-500">
                    No rate cards yet.
                  </TableCell>
                </TableRow>
              ) : (
                rateCards?.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>{card.season}</TableCell>
                    <TableCell>
                      {card.effective_from} {card.effective_to ? `? ${card.effective_to}` : ""}
                    </TableCell>
                    <TableCell>{Number(card.bag_weight_kg ?? 64).toFixed(2)}kg</TableCell>
                    <TableCell className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/cocoa/rate-cards?rate_card_id=${card.id}`}
                        className="rounded-md border border-zinc-200 px-3 py-1 text-sm"
                      >
                        Manage lines
                      </Link>
                      <form action={deleteRateCardAction}>
                        <input type="hidden" name="rate_card_id" value={card.id} />
                        <Button type="submit" variant="ghost">
                          Delete
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate card lines</CardTitle>
          <CardDescription>Set per-tonne rates for geo coverage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!rateCardId ? (
            <p className="text-sm text-zinc-500">Select a rate card to manage lines.</p>
          ) : (
            <>
              <form action={createLineAction} className="grid gap-3 md:grid-cols-4">
                <input type="hidden" name="rate_card_id" value={rateCardId} />
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select name="region_id" required>
                    <option value="">Select region</option>
                    {regions?.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>District</Label>
                  <Select name="district_id" required>
                    <option value="">Select district</option>
                    {districts?.map((district) => (
                      <option key={district.id} value={district.id}>
                        {district.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Depot (optional)</Label>
                  <Select name="depot_id">
                    <option value="">Select depot</option>
                    {depots?.map((depot) => (
                      <option key={depot.id} value={depot.id}>
                        {depot.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Takeover center</Label>
                  <Select name="takeover_center_id" required>
                    <option value="">Select center</option>
                    {centers?.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Producer price / tonne</Label>
                  <Input name="producer_price_per_tonne" type="number" step="0.01" required />
                </div>
                <div className="space-y-2">
                  <Label>Buyer margin / tonne</Label>
                  <Input name="buyer_margin_per_tonne" type="number" step="0.01" required />
                </div>
                <div className="space-y-2">
                  <Label>Secondary evac / tonne</Label>
                  <Input name="secondary_evac_cost_per_tonne" type="number" step="0.01" required />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Add line</Button>
                </div>
              </form>

              <form action={importCsvAction} className="space-y-3 rounded-md border border-zinc-200 p-4">
                <input type="hidden" name="rate_card_id" value={rateCardId} />
                <Label>CSV import (region,district,depot(optional),center,producer,margin,evac)</Label>
                <textarea
                  name="csv"
                  className="min-h-[140px] w-full rounded-md border border-zinc-200 p-3 text-sm"
                  placeholder="Region,District,Depot,Center,Producer,Margin,Evac"
                />
                <Button type="submit" variant="outline">
                  Import CSV
                </Button>
              </form>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Region</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Depot</TableHead>
                    <TableHead>Center</TableHead>
                    <TableHead>Producer</TableHead>
                    <TableHead>Margin</TableHead>
                    <TableHead>Evac</TableHead>
                    <TableHead>Takeover</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lines ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-sm text-zinc-500">
                        No lines yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines?.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{regions?.find((r) => r.id === line.region_id)?.name ?? "-"}</TableCell>
                        <TableCell>{districts?.find((d) => d.id === line.district_id)?.name ?? "-"}</TableCell>
                        <TableCell>{depots?.find((d) => d.id === line.depot_id)?.name ?? "-"}</TableCell>
                        <TableCell>{centers?.find((c) => c.id === line.takeover_center_id)?.name ?? "-"}</TableCell>
                        <TableCell>{Number(line.producer_price_per_tonne ?? 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(line.buyer_margin_per_tonne ?? 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(line.secondary_evac_cost_per_tonne ?? 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(line.takeover_price_per_tonne ?? 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <form action={deleteLineAction}>
                            <input type="hidden" name="line_id" value={line.id} />
                            <Button type="submit" variant="ghost">
                              Delete
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
