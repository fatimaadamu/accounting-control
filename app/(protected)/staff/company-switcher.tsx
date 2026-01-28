"use client";

import { useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string };

export default function CompanySwitcher() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeId) ?? null,
    [companies, activeId]
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);

      try {
        const res = await fetch("/api/me/companies", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        const list: Company[] = data?.companies ?? [];

        if (cancelled) return;

        setCompanies(list);

        const stored = localStorage.getItem("activeCompanyId");
        const validStored = stored && list.some((c) => c.id === stored) ? stored : null;
        const nextActive = validStored ?? (list[0]?.id ?? null);

        setActiveId(nextActive);
        if (nextActive) localStorage.setItem("activeCompanyId", nextActive);

        setLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  function onChange(id: string) {
    setActiveId(id);
    localStorage.setItem("activeCompanyId", id);
    window.location.reload();
  }

  if (loading) return <div className="text-sm text-zinc-600">Company: Loading…</div>;

  if (!companies.length) {
    return (
      <div className="text-sm text-zinc-600">
        No company access yet. Please contact Admin to grant access.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-600">Company:</span>
      <select
        className="rounded-md border px-2 py-1"
        value={activeCompany?.id ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <button
        className="rounded-md border px-2 py-1 text-xs"
        onClick={() => {
          localStorage.removeItem("activeCompanyId");
          window.location.reload();
        }}
      >
        Reset
      </button>
    </div>
  );
}
