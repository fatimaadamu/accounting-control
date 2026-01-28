import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AccordionPanels from "@/components/accordion-panels";
import ToastMessage from "@/components/toast-message";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const defaultCenters = ["Tema", "Takoradi", "Kaase"];
const DEFAULT_DISTRICT_NAME = "General";
const parseCsv = (raw: string) =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));

const ensureDefaultDistrict = async (regionId: string) => {
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

export default async function CocoaGeoPage({
  searchParams,
}: {
  searchParams?: Promise<{ toast?: string; message?: string; csvErrors?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await requireUser();
  const companyId = await ensureActiveCompanyId(user.id, "/admin/cocoa/geo");

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cocoa Geo</CardTitle>
          <CardDescription>No companies assigned. Ask an admin to grant access.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  await requireCompanyRole(user.id, companyId, ["Admin"]);

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

  let { data: centers, error: centerError } = await supabaseAdmin()
    .from("takeover_centers")
    .select("id, name")
    .order("name");

  if (centerError) {
    throw new Error(centerError.message);
  }

  if ((centers ?? []).length === 0) {
    await supabaseAdmin()
      .from("takeover_centers")
      .insert(defaultCenters.map((name) => ({ name })));
    const { data: seededCenters } = await supabaseAdmin()
      .from("takeover_centers")
      .select("id, name")
      .order("name");
    centers = seededCenters ?? [];
  }

  async function createRegion(formData: FormData) {
    "use server";
    const name = String(formData.get("region_name") ?? "").trim();
    if (!name) {
      throw new Error("Region name is required.");
    }
    const { error } = await supabaseAdmin().from("cocoa_regions").insert({ name });
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/geo");
  }

  async function createDepot(formData: FormData) {
    "use server";
    const regionId = String(formData.get("region_id") ?? "");
    const name = String(formData.get("depot_name") ?? "").trim();
    if (!regionId || !name) {
      throw new Error("Region and depot name are required.");
    }
    const districtId = await ensureDefaultDistrict(regionId);
    const { error } = await supabaseAdmin()
      .from("cocoa_depots")
      .insert({ district_id: districtId, name });
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/geo");
  }

  async function createCenter(formData: FormData) {
    "use server";
    const name = String(formData.get("center_name") ?? "").trim();
    if (!name) {
      throw new Error("Center name is required.");
    }
    const { error } = await supabaseAdmin().from("takeover_centers").insert({ name });
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/geo");
  }

  async function importCsvAction(formData: FormData) {
    "use server";
    const csv = String(formData.get("csv") ?? "").trim();
    if (!csv) {
      redirect(
        `/admin/cocoa/geo?toast=error&message=${encodeURIComponent(
          "CSV data is required."
        )}`
      );
    }

    const rows = parseCsv(csv);
    const errors: string[] = [];

    const normalize = (value: string) => value.trim();
    const regionNames = new Set<string>();
    const centerNames = new Set<string>();
    const depotKeys = new Set<string>();

    const parsedRows = rows.map((cells, index) => {
      const [region, depot, center] = cells;
      const regionName = normalize(region ?? "");
      const depotName = normalize(depot ?? "");
      const centerName = normalize(center ?? "");

      if (!regionName || !depotName || !centerName) {
        const missing: string[] = [];
        if (!regionName) missing.push("region");
        if (!depotName) missing.push("depot");
        if (!centerName) missing.push("takeover_center");
        errors.push(
          `Row ${index + 1}: missing ${missing.join(", ")}. Provide all fields (region,depot,takeover_center).`
        );
      } else {
        regionNames.add(regionName);
        centerNames.add(centerName);
      }

      return {
        index: index + 1,
        regionName,
        depotName,
        centerName,
      };
    });

    if (errors.length > 0) {
      const query = new URLSearchParams({
        toast: "error",
        message: "CSV has validation errors.",
        csvErrors: errors.join("\n"),
      });
      redirect(`/admin/cocoa/geo?${query.toString()}`);
    }

    await supabaseAdmin()
      .from("cocoa_regions")
      .upsert(Array.from(regionNames).map((name) => ({ name })), {
        onConflict: "name",
        ignoreDuplicates: true,
      });

    await supabaseAdmin()
      .from("takeover_centers")
      .upsert(Array.from(centerNames).map((name) => ({ name })), {
        onConflict: "name",
        ignoreDuplicates: true,
      });

    const { data: regionRows, error: regionError } = await supabaseAdmin()
      .from("cocoa_regions")
      .select("id, name");
    if (regionError) {
      throw new Error(regionError.message);
    }

    const { data: centerRows, error: centerError } = await supabaseAdmin()
      .from("takeover_centers")
      .select("id, name");
    if (centerError) {
      throw new Error(centerError.message);
    }

    const regionMap = new Map(regionRows.map((row) => [row.name.toLowerCase(), row.id]));
    const centerMap = new Map(centerRows.map((row) => [row.name.toLowerCase(), row.id]));
    const defaultDistrictMap = new Map<string, string>();

    for (const row of parsedRows) {
      const regionId = regionMap.get(row.regionName.toLowerCase());
      if (!regionId) {
        errors.push(
          `Row ${row.index}: region "${row.regionName}" not found after import. Check spelling or import regions first.`
        );
        continue;
      }
      if (!defaultDistrictMap.has(regionId)) {
        const districtId = await ensureDefaultDistrict(regionId);
        defaultDistrictMap.set(regionId, districtId);
      }
      if (!centerMap.get(row.centerName.toLowerCase())) {
        errors.push(
          `Row ${row.index}: takeover center "${row.centerName}" not found after import. Add it or include it in the CSV.`
        );
      }
    }

    const depotPayload: Array<{ district_id: string; name: string }> = [];
    for (const row of parsedRows) {
      const regionId = regionMap.get(row.regionName.toLowerCase());
      if (!regionId) {
        errors.push(
          `Row ${row.index}: region "${row.regionName}" not found after import. Check spelling or import regions first.`
        );
        continue;
      }
      const districtId = defaultDistrictMap.get(regionId);
      if (!districtId) {
        errors.push(
          `Row ${row.index}: unable to create default district for "${row.regionName}".`
        );
        continue;
      }
      const key = `${districtId}:${row.depotName.toLowerCase()}`;
      if (!depotKeys.has(key)) {
        depotKeys.add(key);
        depotPayload.push({ district_id: districtId, name: row.depotName });
      }
    }

    if (depotPayload.length > 0) {
      await supabaseAdmin().from("cocoa_depots").upsert(depotPayload, {
        onConflict: "district_id,name",
        ignoreDuplicates: true,
      });
    }

    if (errors.length > 0) {
      const query = new URLSearchParams({
        toast: "error",
        message: "CSV imported with some issues.",
        csvErrors: errors.join("\n"),
      });
      redirect(`/admin/cocoa/geo?${query.toString()}`);
    }

    revalidatePath("/admin/cocoa/geo");
    redirect(`/admin/cocoa/geo?toast=success&message=${encodeURIComponent("CSV imported.")}`);
  }

  async function deleteRegion(formData: FormData) {
    "use server";
    const id = String(formData.get("region_id") ?? "");
    const { error } = await supabaseAdmin().from("cocoa_regions").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/geo");
  }

  async function deleteDepot(formData: FormData) {
    "use server";
    const id = String(formData.get("depot_id") ?? "");
    const { error } = await supabaseAdmin().from("cocoa_depots").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/geo");
  }

  async function deleteCenter(formData: FormData) {
    "use server";
    const id = String(formData.get("center_id") ?? "");
    const { error } = await supabaseAdmin().from("takeover_centers").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/geo");
  }

  return (
    <div className="space-y-6">
      {resolvedSearchParams?.toast && (
        <ToastMessage
          kind={resolvedSearchParams.toast === "error" ? "error" : "success"}
          message={resolvedSearchParams.message ?? "Action completed"}
        />
      )}
      {resolvedSearchParams?.csvErrors && (
        <Card>
          <CardHeader>
            <CardTitle>CSV import issues</CardTitle>
            <CardDescription>Review the rows below and fix the CSV.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600">
              {resolvedSearchParams.csvErrors.split("\n").map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <details className="rounded-md border border-zinc-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
          Bulk Import (CSV)
        </summary>
        <div className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Import / Paste CSV</CardTitle>
              <CardDescription>
                Format: region,depot,takeover_center
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={importCsvAction} className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>CSV data</Label>
                  <details className="text-xs text-zinc-500">
                    <summary className="cursor-pointer">Template</summary>
                    <div className="mt-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono">
                      region,depot,takeover_center
                    </div>
                  </details>
                </div>
                <textarea
                  name="csv"
                  className="min-h-[140px] w-full rounded-md border border-zinc-200 p-3 text-sm"
                  placeholder="Ashanti,Depot A,Tema"
                />
                <Button type="submit" variant="outline">
                  Import CSV
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </details>

      <AccordionPanels
        items={[
          {
            id: "centers",
            title: "Takeover Centers",
            defaultOpen: true,
            children: (
              <div className="space-y-4">
                <p className="text-sm text-zinc-600">
                  Manage takeover centers (Tema, Takoradi, Kaase).
                </p>
                <form action={createCenter} className="flex flex-wrap gap-3">
                  <div className="min-w-[220px] flex-1">
                    <Label htmlFor="center_name">Center name</Label>
                    <Input id="center_name" name="center_name" required />
                  </div>
                  <div className="self-end">
                    <Button type="submit">Add center</Button>
                  </div>
                </form>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(centers ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-sm text-zinc-500">
                          No centers yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      centers?.map((center) => (
                        <TableRow key={center.id}>
                          <TableCell>{center.name}</TableCell>
                          <TableCell>
                            <form action={deleteCenter}>
                              <input type="hidden" name="center_id" value={center.id} />
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
              </div>
            ),
          },
          {
            id: "regions",
            title: "Regions",
            defaultOpen: true,
            children: (
              <div className="space-y-4">
                <p className="text-sm text-zinc-600">Manage cocoa regions.</p>
                <form action={createRegion} className="flex flex-wrap gap-3">
                  <div className="min-w-[220px] flex-1">
                    <Label htmlFor="region_name">Region name</Label>
                    <Input id="region_name" name="region_name" required />
                  </div>
                  <div className="self-end">
                    <Button type="submit">Add region</Button>
                  </div>
                </form>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-sm text-zinc-500">
                          No regions yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      regions.map((region) => (
                        <TableRow key={region.id}>
                          <TableCell>{region.name}</TableCell>
                          <TableCell>
                            <form action={deleteRegion}>
                              <input type="hidden" name="region_id" value={region.id} />
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
              </div>
            ),
          },
          {
            id: "depots",
            title: "Depots",
            children: (
              <div className="space-y-4">
                <p className="text-sm text-zinc-600">Assign depots to regions.</p>
                <form action={createDepot} className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <select
                      name="region_id"
                      className="h-10 w-full rounded-md border border-zinc-200 px-3"
                      required
                    >
                      <option value="">Select region</option>
                      {regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depot_name">Depot name</Label>
                    <Input id="depot_name" name="depot_name" required />
                  </div>
                  <div className="self-end">
                    <Button type="submit">Add depot</Button>
                  </div>
                </form>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Depot</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depots.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-zinc-500">
                          No depots yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      depots.map((depot) => (
                        <TableRow key={depot.id}>
                          <TableCell>{depot.name}</TableCell>
                          <TableCell>
                            {(() => {
                              const district = districts.find(
                                (item) => item.id === depot.district_id
                              );
                              if (!district) {
                                return "-";
                              }
                              return (
                                regions.find((region) => region.id === district.region_id)
                                  ?.name ?? "-"
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <form action={deleteDepot}>
                              <input type="hidden" name="depot_id" value={depot.id} />
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
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
