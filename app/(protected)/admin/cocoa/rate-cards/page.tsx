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
import { formatMoney } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/admin";

const parseCsv = (raw: string) =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));

const DEFAULT_DISTRICT_NAME = "General";

const ensureDefaultDistrict = async (regionId: string): Promise<string> => {
  const { data: existing } = await supabaseAdmin()
    .from("cocoa_districts")
    .select("id")
    .eq("region_id", regionId)
    .eq("name", DEFAULT_DISTRICT_NAME)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabaseAdmin()
    .from("cocoa_districts")
    .insert({ region_id: regionId, name: DEFAULT_DISTRICT_NAME })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Unable to create default district.");
  }

  return data.id;
};

export default async function CocoaRateCardsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    rate_card_id?: string;
    toast?: string;
    message?: string;
    depot?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedRateCardId = resolvedSearchParams?.rate_card_id ?? "";
  const depotFilter = (resolvedSearchParams?.depot ?? "").trim().toLowerCase();

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

  let rateCards:
    | Array<{
        id: string;
        season: string | null;
        effective_from: string;
        effective_to: string | null;
        bag_weight_kg: number | null;
        bags_per_tonne?: number | null;
      }>
    | null = null;
  const { data: rateCardsData, error: rateCardError } = await supabaseAdmin()
    .from("cocoa_rate_cards")
    .select("id, season, effective_from, effective_to, bag_weight_kg, bags_per_tonne")
    .eq("company_id", companyId)
    .order("effective_from", { ascending: false });

  if (rateCardError && rateCardError.message.includes("bags_per_tonne")) {
    const { data: fallbackData, error: fallbackError } = await supabaseAdmin()
      .from("cocoa_rate_cards")
      .select("id, season, effective_from, effective_to, bag_weight_kg")
      .eq("company_id", companyId)
      .order("effective_from", { ascending: false });

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    rateCards = (fallbackData ?? []).map((card) => ({
      ...card,
      bags_per_tonne: null,
    }));
  } else if (rateCardError) {
    throw new Error(rateCardError.message);
  } else {
    rateCards = rateCardsData ?? [];
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
          "id, rate_card_id, region_id, district_id, depot_id, takeover_center_id, producer_price_per_tonne, buyer_margin_per_tonne, secondary_evac_cost_per_tonne, takeover_price_per_tonne, created_at"
        )
        .eq("rate_card_id", rateCardId)
    : { data: [], error: null };

  if (linesError) {
    throw new Error(linesError.message);
  }

  const regionNameMap = new Map((regions ?? []).map((region) => [region.id, region.name]));
  const depotNameMap = new Map((depots ?? []).map((depot) => [depot.id, depot.name]));
  const centerNameMap = new Map((centers ?? []).map((center) => [center.id, center.name]));
  const centerSortOrder = ["Tema", "Kaase", "Takoradi"];

  const filteredLines = (lines ?? []).filter((line) => {
    if (!depotFilter) {
      return true;
    }
    const depotName = depotNameMap.get(line.depot_id ?? "") ?? "";
    return depotName.toLowerCase().includes(depotFilter);
  });

  const orderedLines = [...filteredLines].sort((a, b) => {
    const aTime = new Date(a.created_at ?? 0).getTime();
    const bTime = new Date(b.created_at ?? 0).getTime();
    return bTime - aTime;
  });

  const uniqueLines = new Map<string, (typeof orderedLines)[number]>();
  let duplicateCount = 0;
  for (const line of orderedLines) {
    const key = `${line.depot_id ?? "null"}:${line.takeover_center_id}`;
    if (uniqueLines.has(key)) {
      duplicateCount += 1;
      continue;
    }
    uniqueLines.set(key, line);
  }

  const groupedByRegion = new Map<
    string,
    Map<string, Map<string, (typeof orderedLines)[number]>>
  >();
  for (const line of Array.from(uniqueLines.values())) {
    const regionId = line.region_id ?? "unknown";
    if (!groupedByRegion.has(regionId)) {
      groupedByRegion.set(regionId, new Map());
    }
    const centerMap = groupedByRegion.get(regionId)!;
    const centerId = line.takeover_center_id;
    if (!centerMap.has(centerId)) {
      centerMap.set(centerId, new Map());
    }
    const depotMap = centerMap.get(centerId)!;
    const depotId = line.depot_id ?? "unknown";
    depotMap.set(depotId, line);
  }

  async function createRateCardAction(formData: FormData) {
    "use server";
    const season = String(formData.get("season") ?? "").trim();
    const effectiveFrom = String(formData.get("effective_from") ?? "");
    const effectiveTo = String(formData.get("effective_to") ?? "") || null;
    const bagWeightKg = Number(formData.get("bag_weight_kg") ?? 64);
    const bagsPerTonne = Number(formData.get("bags_per_tonne") ?? 16);

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
        bags_per_tonne: bagsPerTonne || 16,
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
    const depotId = String(formData.get("depot_id") ?? "");
    const takeoverCenterId = String(formData.get("takeover_center_id") ?? "");
    const producerPrice = Number(formData.get("producer_price_per_tonne") ?? 0);
    const buyerMargin = Number(formData.get("buyer_margin_per_tonne") ?? 0);
    const secondaryEvac = Number(formData.get("secondary_evac_cost_per_tonne") ?? 0);
    const takeoverPrice = Number(formData.get("takeover_price_per_tonne") ?? 0);

    if (!rateCardIdValue || !regionId || !depotId || !takeoverCenterId) {
      throw new Error("Rate card, region, depot, and takeover center are required.");
    }

    if (producerPrice <= 0 || buyerMargin <= 0 || secondaryEvac <= 0 || takeoverPrice <= 0) {
      throw new Error("All rate values must be greater than 0.");
    }

    const districtId = await ensureDefaultDistrict(regionId);

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

  async function updateLineAction(formData: FormData) {
    "use server";
    const lineId = String(formData.get("line_id") ?? "");
    const producerPrice = Number(formData.get("producer_price_per_tonne") ?? 0);
    const buyerMargin = Number(formData.get("buyer_margin_per_tonne") ?? 0);
    const secondaryEvac = Number(formData.get("secondary_evac_cost_per_tonne") ?? 0);
    const takeoverPrice = Number(formData.get("takeover_price_per_tonne") ?? 0);

    if (!lineId) {
      throw new Error("Rate card line not found.");
    }

    if (producerPrice <= 0 || buyerMargin <= 0 || secondaryEvac <= 0 || takeoverPrice <= 0) {
      throw new Error("All rate values must be greater than 0.");
    }

    const { error } = await supabaseAdmin()
      .from("cocoa_rate_card_lines")
      .update({
        producer_price_per_tonne: producerPrice,
        buyer_margin_per_tonne: buyerMargin,
        secondary_evac_cost_per_tonne: secondaryEvac,
        takeover_price_per_tonne: takeoverPrice,
      })
      .eq("id", lineId);

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

    const regionList = regions ?? [];
    const districtList = districts ?? [];
    const depotList = depots ?? [];
    const centerList = centers ?? [];

    const regionMap = new Map(
      regionList.map((region) => [region.name.toLowerCase(), region.id])
    );
    const districtRegionMap = new Map(
      districtList.map((district) => [district.id, district.region_id])
    );
    const depotMap = new Map<string, string>();
    for (const depot of depotList) {
      const regionId = districtRegionMap.get(depot.district_id);
      if (!regionId) {
        continue;
      }
      depotMap.set(`${regionId}:${depot.name.toLowerCase()}`, depot.id);
    }
    const centerMap = new Map(
      centerList.map((center) => [center.name.toLowerCase(), center.id])
    );

    const rows = parseCsv(csv);
    const payload: Array<Record<string, unknown>> = [];
    let insertedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const { data: existingLines, error: existingLinesError } = await supabaseAdmin()
      .from("cocoa_rate_card_lines")
      .select("depot_id, takeover_center_id")
      .eq("rate_card_id", rateCardIdValue);

    if (existingLinesError) {
      throw new Error(existingLinesError.message);
    }

    const existingKeys = new Set(
      (existingLines ?? []).map(
        (line) => `${line.depot_id ?? "null"}:${line.takeover_center_id}`
      )
    );
    const incomingKeys = new Set<string>();
    const districtMap = new Map<string, string>();

    for (const [index, cells] of rows.entries()) {
      const [
        regionName,
        depotName,
        centerName,
        producer,
        margin,
        evac,
        takeover,
      ] = cells;

      const normalizedRegion = (regionName ?? "").trim();
      const normalizedDepot = (depotName ?? "").trim();
      const normalizedCenter = (centerName ?? "").trim();

      if (!normalizedRegion || !normalizedDepot || !normalizedCenter) {
        failedCount += 1;
        continue;
      }

      const regionId = regionMap.get(normalizedRegion.toLowerCase());
      const depotKey = regionId && depotName ? `${regionId}:${depotName.toLowerCase()}` : "";
      const depotId = depotKey ? depotMap.get(depotKey) ?? null : null;
      const centerId = centerMap.get(normalizedCenter.toLowerCase());

      if (!regionId || !centerId || !depotId) {
        failedCount += 1;
        continue;
      }

      let districtId = districtMap.get(regionId);
      if (!districtId) {
        districtId = await ensureDefaultDistrict(regionId);
        if (!districtId) {
          throw new Error(`Unable to resolve default district for region ${regionId}.`);
        }
        districtMap.set(regionId, districtId);
      }

      const producerPrice = Number(producer ?? 0);
      const buyerMargin = Number(margin ?? 0);
      const secondaryEvac = Number(evac ?? 0);
      const takeoverPrice = Number(takeover ?? 0);

      if (
        producerPrice <= 0 ||
        buyerMargin <= 0 ||
        secondaryEvac <= 0 ||
        takeoverPrice <= 0
      ) {
        failedCount += 1;
        continue;
      }

      const key = `${depotId}:${centerId}`;
      if (existingKeys.has(key) || incomingKeys.has(key)) {
        skippedCount += 1;
        continue;
      }

      incomingKeys.add(key);
      payload.push({
        rate_card_id: rateCardIdValue,
        region_id: regionId,
        district_id: districtId,
        depot_id: depotId,
        takeover_center_id: centerId,
        producer_price_per_tonne: producerPrice,
        buyer_margin_per_tonne: buyerMargin,
        secondary_evac_cost_per_tonne: secondaryEvac,
        takeover_price_per_tonne: takeoverPrice,
      });
    }

    if (payload.length > 0) {
      const { error } = await supabaseAdmin().from("cocoa_rate_card_lines").insert(payload);
      if (error) {
        throw new Error(error.message);
      }
      insertedCount = payload.length;
    }

    revalidatePath("/admin/cocoa/rate-cards");
    const message = `Imported: ${insertedCount} inserted, ${skippedCount} duplicates skipped, ${failedCount} failed.`;
    const query = new URLSearchParams({
      toast: failedCount > 0 ? "error" : "success",
      message,
      rate_card_id: rateCardIdValue,
    });
    redirect(`/admin/cocoa/rate-cards?${query.toString()}`);
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
            <div className="space-y-1">
              <Label>Bags per tonne</Label>
              <Input name="bags_per_tonne" type="number" step="0.01" defaultValue={16} />
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
                <TableHead>Bags/tonne</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rateCards ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-zinc-500">
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
                    <TableCell>{Number(card.bags_per_tonne ?? 16).toFixed(2)}</TableCell>
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
                  <Label>Depot</Label>
                  <Select name="depot_id" required>
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
                <div className="space-y-2">
                  <Label>Takeover price / tonne</Label>
                  <Input name="takeover_price_per_tonne" type="number" step="0.01" required />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Add line</Button>
                </div>
              </form>

              <details className="rounded-md border border-zinc-200 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                  Bulk Import (CSV)
                </summary>
                <form action={importCsvAction} className="space-y-3 pt-3">
                  <input type="hidden" name="rate_card_id" value={rateCardId} />
                  <div className="flex items-center justify-between">
                    <Label>CSV import</Label>
                    <details className="text-xs text-zinc-500">
                      <summary className="cursor-pointer">Template</summary>
                      <div className="mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono">
                        region,depot,center,producer,margin,evac,takeover
                      </div>
                    </details>
                  </div>
                  <textarea
                    name="csv"
                    className="min-h-[140px] w-full rounded-md border border-zinc-200 p-3 text-sm"
                    placeholder="Region,Depot,Center,Producer,Margin,Evac,Takeover"
                  />
                  <Button type="submit" variant="outline">
                    Import CSV
                  </Button>
                </form>
              </details>

              <form className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="rate_card_id" value={rateCardId} />
                <div className="space-y-1">
                  <Label>Filter by depot</Label>
                  <Input name="depot" placeholder="Search depot name" defaultValue={depotFilter} />
                </div>
                <Button type="submit" variant="outline">
                  Filter
                </Button>
              </form>

              {duplicateCount > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {duplicateCount} duplicate rate line(s) hidden. The latest entry per depot + center is shown.
                </div>
              )}

              {Array.from(uniqueLines.values()).length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                  No rate card lines match this filter.
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.from(groupedByRegion.entries())
                    .sort((a, b) => {
                      const nameA = regionNameMap.get(a[0]) ?? "";
                      const nameB = regionNameMap.get(b[0]) ?? "";
                      return nameA.localeCompare(nameB);
                    })
                    .map(([regionId, depotMap]) => (
                      <details key={regionId} className="rounded-md border border-zinc-200 p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                          {regionNameMap.get(regionId) ?? "Unknown region"}
                        </summary>
                        <div className="mt-4 space-y-4">
                          {Array.from(depotMap.entries())
                            .sort((a, b) => {
                              const nameA = centerNameMap.get(a[0]) ?? "";
                              const nameB = centerNameMap.get(b[0]) ?? "";
                              const aIndex = centerSortOrder.indexOf(nameA);
                              const bIndex = centerSortOrder.indexOf(nameB);
                              if (aIndex !== -1 || bIndex !== -1) {
                                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                              }
                              return nameA.localeCompare(nameB);
                            })
                            .map(([centerId, depotLines]) => (
                              <details key={centerId} className="rounded-md border border-zinc-100 p-3">
                                <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                                  {centerNameMap.get(centerId) ?? "Unknown center"}
                                </summary>
                                <div className="mt-3 space-y-3">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Depot</TableHead>
                                        <TableHead>Producer</TableHead>
                                        <TableHead>Margin</TableHead>
                                        <TableHead>Evac</TableHead>
                                        <TableHead>Takeover</TableHead>
                                        <TableHead>Action</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {Array.from(depotLines.entries())
                                        .sort((a, b) => {
                                          const nameA = depotNameMap.get(a[0]) ?? "";
                                          const nameB = depotNameMap.get(b[0]) ?? "";
                                          return nameA.localeCompare(nameB);
                                        })
                                        .map(([depotId, line]) => (
                                          <TableRow key={line.id}>
                                            <TableCell>{depotNameMap.get(depotId) ?? "-"}</TableCell>
                                            <TableCell>{formatMoney(Number(line.producer_price_per_tonne ?? 0))}</TableCell>
                                            <TableCell>{formatMoney(Number(line.buyer_margin_per_tonne ?? 0))}</TableCell>
                                            <TableCell>{formatMoney(Number(line.secondary_evac_cost_per_tonne ?? 0))}</TableCell>
                                            <TableCell>{formatMoney(Number(line.takeover_price_per_tonne ?? 0))}</TableCell>
                                            <TableCell className="space-y-2">
                                              <details className="inline-block">
                                                <summary className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900">
                                                  Edit
                                                </summary>
                                                <form action={updateLineAction} className="mt-2 grid gap-2">
                                                  <input type="hidden" name="line_id" value={line.id} />
                                                  <Input
                                                    name="producer_price_per_tonne"
                                                    type="number"
                                                    step="0.01"
                                                    defaultValue={line.producer_price_per_tonne ?? 0}
                                                    required
                                                  />
                                                  <Input
                                                    name="buyer_margin_per_tonne"
                                                    type="number"
                                                    step="0.01"
                                                    defaultValue={line.buyer_margin_per_tonne ?? 0}
                                                    required
                                                  />
                                                  <Input
                                                    name="secondary_evac_cost_per_tonne"
                                                    type="number"
                                                    step="0.01"
                                                    defaultValue={line.secondary_evac_cost_per_tonne ?? 0}
                                                    required
                                                  />
                                                  <Input
                                                    name="takeover_price_per_tonne"
                                                    type="number"
                                                    step="0.01"
                                                    defaultValue={line.takeover_price_per_tonne ?? 0}
                                                    required
                                                  />
                                                  <Button type="submit" variant="outline">
                                                    Save
                                                  </Button>
                                                </form>
                                              </details>
                                              <form action={deleteLineAction}>
                                                <input type="hidden" name="line_id" value={line.id} />
                                                <Button type="submit" variant="ghost">
                                                  Delete
                                                </Button>
                                              </form>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </details>
                            ))}
                        </div>
                      </details>
                    ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
