"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBags, formatMoney, formatTonnage } from "@/lib/format";

type CtroRow = {
  id: string;
  ctro_date: string | null;
  ctro_no: string | null;
  season: string | null;
  status: string;
  total_bags: number;
  total_tonnage: number;
  grand_total: number;
};

type CtroActiveTableProps = {
  rows: CtroRow[];
  canSubmitDraft: boolean;
  canPostSubmitted: boolean;
  canDeleteDraft: boolean;
  isAdmin: boolean;
  missingCtroAccounts: boolean;
  submitAction: (formData: FormData) => void;
  postAction: (formData: FormData) => void;
  submitAndPostAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
};

export default function CtroActiveTable({
  rows,
  canSubmitDraft,
  canPostSubmitted,
  canDeleteDraft,
  isAdmin,
  missingCtroAccounts,
  submitAction,
  postAction,
  submitAndPostAction,
  deleteAction,
}: CtroActiveTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const allSelected = useMemo(
    () => rows.length > 0 && selectedIds.length === rows.length,
    [rows.length, selectedIds.length]
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((row) => row.id));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handlePrintSelected = () => {
    if (selectedIds.length === 0) return;
    router.push(`/staff/ctro/print-pack?ids=${encodeURIComponent(selectedIds.join(","))}`);
  };

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-end">
          <Button type="button" variant="outline" onClick={handlePrintSelected}>
            Print Selected
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                aria-label="Select all CTROs"
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>CTRO No</TableHead>
            <TableHead>Season</TableHead>
            <TableHead>Bags</TableHead>
            <TableHead>Tonnage</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-sm text-zinc-500">
                No CTROs yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((ctro) => (
              <TableRow key={ctro.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(ctro.id)}
                    onChange={() => toggleOne(ctro.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                    aria-label={`Select ${ctro.ctro_no ?? "CTRO"}`}
                  />
                </TableCell>
                <TableCell>{ctro.ctro_date}</TableCell>
                <TableCell>{ctro.ctro_no}</TableCell>
                <TableCell>{ctro.season ?? "-"}</TableCell>
                <TableCell>{formatBags(Number(ctro.total_bags ?? 0))}</TableCell>
                <TableCell>{formatTonnage(Number(ctro.total_tonnage ?? 0))}</TableCell>
                <TableCell>{formatMoney(Number(ctro.grand_total ?? 0))}</TableCell>
                <TableCell>{ctro.status}</TableCell>
                <TableCell className="space-y-2">
                  <Link
                    href={`/staff/ctro/${ctro.id}`}
                    className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    View
                  </Link>
                  {ctro.status === "draft" && canSubmitDraft && (
                    <form action={submitAction}>
                      <input type="hidden" name="ctro_id" value={ctro.id} />
                      <Button type="submit" variant="outline">
                        Submit
                      </Button>
                    </form>
                  )}
                  {ctro.status === "draft" &&
                    isAdmin &&
                    canSubmitDraft &&
                    canPostSubmitted &&
                    !missingCtroAccounts && (
                      <form action={submitAndPostAction}>
                        <input type="hidden" name="ctro_id" value={ctro.id} />
                        <Button type="submit">Submit &amp; Post</Button>
                      </form>
                    )}
                  {ctro.status === "submitted" && canPostSubmitted && !missingCtroAccounts && (
                    <form action={postAction}>
                      <input type="hidden" name="ctro_id" value={ctro.id} />
                      <Button type="submit" variant="outline">
                        Post
                      </Button>
                    </form>
                  )}
                  {ctro.status === "draft" && canDeleteDraft && (
                    <form action={deleteAction}>
                      <input type="hidden" name="ctro_id" value={ctro.id} />
                      <Button type="submit" variant="ghost">
                        Delete
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
