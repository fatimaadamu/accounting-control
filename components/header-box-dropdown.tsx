"use client";

import Link from "next/link";

type HeaderBoxItem = {
  href: string;
  label: string;
};

type HeaderBoxDropdownProps = {
  label: string;
  items: HeaderBoxItem[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  align?: "left" | "right";
};

export default function HeaderBoxDropdown({
  label,
  items,
  open,
  onOpenChange,
  align = "left",
}: HeaderBoxDropdownProps) {
  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-10 items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>{label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-4 w-4 text-zinc-500"
          fill="currentColor"
        >
          <path d="M5.25 7.5l4.5 4.5 4.5-4.5" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-20 mt-2 w-56 rounded-md border border-zinc-200 bg-white py-1 shadow-lg`}
        >
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="block px-3 py-2 text-sm hover:bg-zinc-50">
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
