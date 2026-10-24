import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

function safeCallback(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const callbackUrl = safeCallback((await searchParams).callbackUrl);
  if ((await auth())?.user) redirect(callbackUrl);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-8 text-center">
        <h1 className="text-2xl font-bold">Nexus Lounge</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to join the room.</p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: callbackUrl });
          }}
        >
          <button className="w-full rounded-lg bg-[#5865f2] px-4 py-3 font-semibold transition hover:brightness-110">
            Continue with Discord
          </button>
        </form>
      </div>
    </main>
  );
}
