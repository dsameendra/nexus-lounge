import Link from "next/link";
import { LegalLinks } from "./LegalLinks";
import { Logo } from "./Logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-10">
      <Link href="/" className="mb-8 inline-flex items-center gap-3 text-sm text-label-2 transition hover:text-white">
        <Logo size={28} /> Nexus Lounge
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-label-3">Last updated {updated}</p>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-label-2 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_a]:text-accent [&_a]:hover:underline">
        {children}
      </div>
      <LegalLinks className="mt-12 pb-6" />
    </main>
  );
}
