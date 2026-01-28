"use client";

import * as React from "react";

type PanelItem = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

type AccordionPanelsProps = {
  items: PanelItem[];
};

export default function AccordionPanels({ items }: AccordionPanelsProps) {
  const defaultOpenIds = items.filter((item) => item.defaultOpen).map((item) => item.id);
  const [openIds, setOpenIds] = React.useState<string[]>(
    defaultOpenIds.length > 0 ? defaultOpenIds : items[0] ? [items[0].id] : []
  );

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const isOpen = openIds.includes(item.id);
        return (
          <div key={item.id} className="rounded-md border border-zinc-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-zinc-800"
              onClick={() =>
                setOpenIds((prev) => (prev.includes(item.id) ? [] : [item.id]))
              }
              aria-expanded={isOpen}
            >
              <span>{item.title}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                fill="currentColor"
              >
                <path d="M5.25 7.5l4.5 4.5 4.5-4.5" />
              </svg>
            </button>
            {isOpen && <div className="border-t border-zinc-200 p-4">{item.children}</div>}
          </div>
        );
      })}
    </div>
  );
}
