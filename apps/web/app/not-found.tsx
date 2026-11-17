import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-sheet)] bg-panel p-8 text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-label-2">This page doesn&apos;t exist, or the link is out of date.</p>
        <Link href="/" className="mt-6 flex h-12 items-center justify-center rounded-xl bg-accent font-semibold transition hover:brightness-110 active:scale-[0.99]">
          Back home
        </Link>
      </div>
    </main>
  );
}
