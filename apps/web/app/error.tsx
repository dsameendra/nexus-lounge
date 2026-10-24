"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-sheet)] bg-panel p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-label-2">The page hit an unexpected problem. Trying again usually fixes it.</p>
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={reset} className="h-12 rounded-xl bg-accent font-semibold transition hover:brightness-110 active:scale-[0.99]">
            Try again
          </button>
          <Link href="/" className="flex h-12 items-center justify-center rounded-xl bg-panel-2 font-semibold transition hover:bg-panel-3">
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
