"use client";

import { Button } from "@/components/ui/button";

type PrintNowButtonProps = {
  label?: string;
  className?: string;
};

export default function PrintNowButton({ label = "Print Now", className }: PrintNowButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
