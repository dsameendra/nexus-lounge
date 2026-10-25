import { notFound, redirect } from "next/navigation";
import { adminIdentity, adminSession } from "@/lib/admin";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reauth?: string }> }) {
  if (!(await adminIdentity())) notFound();
  const params = await searchParams;
  if ((await adminSession()) && !params.reauth) redirect("/admin");
  const error = params.error;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form action={loginAction} className="w-full max-w-sm space-y-4 rounded-[var(--radius-sheet)] bg-panel p-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-label-2">{params.reauth ? "Confirm it's you before changing anything: enter a fresh code from your authenticator app." : "Enter the 6-digit code from your authenticator app."}</p>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          aria-label="Authenticator code"
          className="h-14 w-full rounded-xl bg-panel-2 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:ring-2 focus:ring-accent"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error === "locked" ? "Too many wrong codes. Wait a few minutes." : "That code didn't work."}
          </p>
        )}
        <button className="h-12 w-full rounded-xl bg-accent font-semibold transition hover:brightness-110 active:scale-[0.99]">Continue</button>
      </form>
    </main>
  );
}
