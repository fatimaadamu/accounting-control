"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export default function ApproveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className={
        "group inline-flex items-center gap-2 border-zinc-200 text-zinc-700 " +
        "hover:bg-zinc-50 active:border-zinc-300 active:bg-zinc-100 " +
        (pending ? "cursor-progress" : "")
      }
    >
      {pending && (
        <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent" />
      )}
      {pending ? "Approving…" : "Approve"}
    </Button>
  );
}
