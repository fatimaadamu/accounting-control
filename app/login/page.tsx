"use client";

import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div suppressHydrationWarning>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
            <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              Loading…
            </div>
          </div>
        }
      >
        <LoginClient />
      </Suspense>
    </div>
  );
}
