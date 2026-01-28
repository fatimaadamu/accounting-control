import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ToastMessage from "@/components/toast-message";
import { ensureActiveCompanyId, requireCompanyRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const defaultCenters = ["Tema", "Takoradi", "Kaase"];
const parseCsv = (raw: string) =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));

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

  async function createDistrict(formData: FormData) {
    "use server";
    const regionId = String(formData.get("region_id") ?? "");
    const name = String(formData.get("district_name") ?? "").trim();
    if (!regionId || !name) {
      throw new Error("Region and district name are required.");
    }
    const { error } = await supabaseAdmin()
      .from("cocoa_districts")
      .insert({ region_id: regionId, name });
    if (error) {
      throw new Error(error.message);
    }
    revalidatePath("/admin/cocoa/geo");
  }

  async function createDepot(formData: FormData) {
    "use server";
    const districtId = String(formData.get("district_id") ?? "");
    const name = String(formData.get("depot_name") ?? "").trim();
    if (!districtId || !name) {
      throw new Error("District and depot name are required.");
    }
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
    const districtKeys = new Set<string>();
    const depotKeys = new Set<string>();

    const parsedRows = rows.map((cells, index) => {
      const [region, district, depot, center] = cells;
      const regionName = normalize(region ?? "");
      const districtName = normalize(district ?? "");
      const depotName = normalize(depot ?? "");
      const centerName = normalize(center ?? "");

      if (!regionName || !districtName || !depotName || !centerName) {
        errors.push(`Row ${index + 1}: region, district, depot, center are required.`);
      } else {
        regionNames.add(regionName);
        centerNames.add(centerName);
      }

      return {
        index: index + 1,
        regionName,
        districtName,
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

    const districtPayload: Array<{ region_id: string; name: string }> = [];
    for (const row of parsedRows) {
      const regionId = regionMap.get(row.regionName.toLowerCase());
      if (!regionId) {
        errors.push(`Row ${row.index}: region not found after import.`);
        continue;
      }
      const key = `${regionId}:${row.districtName.toLowerCase()}`;
      if (!districtKeys.has(key)) {
        districtKeys.add(key);
        districtPayload.push({ region_id: regionId, name: row.districtName });
      }
      if (!centerMap.get(row.centerName.toLowerCase())) {
        errors.push(`Row ${row.index}: takeover center not found after import.`);
      }
    }

    if (districtPayload.length > 0) {
      await supabaseAdmin().from("cocoa_districts").upsert(districtPayload, {
        onConflict: "region_id,name",
        ignoreDuplicates: true,
      });
    }

    const { data: districtRows, error: districtError } = await supabaseAdmin()
      .from("cocoa_districts")
      .select("id, name, region_id");
    if (districtError) {
      throw new Error(districtError.message);
    }
    const districtMap = new Map(
      districtRows.map((row) => [`${row.region_id}:${row.name.toLowerCase()}`, row.id])
    );

    const depotPayload: Array<{ district_id: string; name: string }> = [];
    for (const row of parsedRows) {
      const regionId = regionMap.get(row.regionName.toLowerCase());
      if (!regionId) {
        errors.push(`Row ${row.index}: region not found after import.`);
        continue;
      }
      const districtId = districtMap.get(`${regionId}:${row.districtName.toLowerCase()}`);
      if (!districtId) {
        errors.push(`Row ${row.index}: district not found after import.`);
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

  async function deleteDistrict(formData: FormData) {
    "use server";
    const id = String(formData.get("district_id") ?? "");
    const { error } = await supabaseAdmin().from("cocoa_districts").delete().eq("id", id);
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

      <Card>
        <CardHeader>
          <CardTitle>Import / Paste CSV</CardTitle>
          <CardDescription>
            Format: region,district,depot,takeover_center
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={importCsvAction} className="space-y-3">
            <textarea
              name="csv"
              className="min-h-[140px] w-full rounded-md border border-zinc-200 p-3 text-sm"
              placeholder="Ashanti,Kumasi Depot,Depot A,Tema"
            />
            <Button type="submit" variant="outline">
              Import CSV
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regions</CardTitle>
          <CardDescription>Manage cocoa regions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Districts</CardTitle>
          <CardDescription>Assign districts to regions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createDistrict} className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Region</Label>
              <select name="region_id" className="h-10 w-full rounded-md border border-zinc-200 px-3" required>
                <option value="">Select region</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="district_name">District name</Label>
              <Input id="district_name" name="district_name" required />
            </div>
            <div className="self-end">
              <Button type="submit">Add district</Button>
            </div>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>District</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {districts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-zinc-500">
                    No districts yet.
                  </TableCell>
                </TableRow>
              ) : (
                districts.map((district) => (
                  <TableRow key={district.id}>
                    <TableCell>{district.name}</TableCell>
                    <TableCell>
                      {regions.find((region) => region.id === district.region_id)?.name ?? "-"}
                    </TableCell>
                    <TableCell>
                      <form action={deleteDistrict}>
                        <input type="hidden" name="district_id" value={district.id} />
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
          <CardTitle>Depots</CardTitle>
          <CardDescription>Assign depots to districts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createDepot} className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>District</Label>
              <select name="district_id" className="h-10 w-full rounded-md border border-zinc-200 px-3" required>
                <option value="">Select district</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
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
                <TableHead>District</TableHead>
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
                      {districts.find((district) => district.id === depot.district_id)?.name ?? "-"}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Takeover Centers</CardTitle>
          <CardDescription>Manage takeover centers (Tema, Takoradi, Kaase).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
