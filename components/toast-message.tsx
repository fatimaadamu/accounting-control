"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ToastMessageProps = {
  kind: "success" | "error";
  message: string;
  durationMs?: number;
};

export default function ToastMessage({
  kind,
  message,
  durationMs = 2500,
}: ToastMessageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("toast");
      params.delete("message");
      const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(next);
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, pathname, router, searchParams]);

  const baseClass =
    "fixed right-4 top-4 z-50 rounded-md border px-4 py-3 text-sm shadow-sm";
  const styleClass =
    kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div role="status" className={`${baseClass} ${styleClass}`}>
      {message}
    </div>
  );
}
