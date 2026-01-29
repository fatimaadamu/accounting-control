"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import ToastMessage from "@/components/toast-message";
import { Button } from "@/components/ui/button";

type ReprintAction = (formData: FormData) => Promise<{ ok: boolean; message?: string }>;

type CtroReprintButtonProps = {
  action: ReprintAction;
  ctroId: string;
};

export default function CtroReprintButton({ action, ctroId }: CtroReprintButtonProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [toast, setToast] = React.useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  const handleReprint = async () => {
    const confirmed = window.confirm("Reprint this CTRO?");
    if (!confirmed) {
      return;
    }
    setPending(true);
    setToast(null);
    try {
      const formData = new FormData();
      formData.set("ctro_id", ctroId);
      const result = await action(formData);
      if (result.ok) {
        setToast({ kind: "success", message: result.message ?? "CTRO reprinted." });
        router.refresh();
      } else {
        setToast({ kind: "error", message: result.message ?? "Unable to reprint CTRO." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to reprint CTRO.";
      setToast({ kind: "error", message });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      {toast && <ToastMessage kind={toast.kind} message={toast.message} />}
      <Button type="button" variant="outline" onClick={handleReprint} disabled={pending}>
        {pending ? "Reprinting..." : "Reprint"}
      </Button>
    </div>
  );
}