import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Logo } from "@/components/Logo";

function safeCallback(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const callbackUrl = safeCallback((await searchParams).callbackUrl);
  if ((await auth())?.user) redirect(callbackUrl);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={84} />
          <h1 className="mt-5 text-4xl font-bold tracking-tight">Nexus Lounge</h1>
          <p className="mt-2 text-label-2">Watch together. Talk like you're in the same room.</p>
        </div>
        <div className="rounded-[var(--radius-sheet)] bg-panel p-5">
          <form
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: callbackUrl });
            }}
          >
            <button className="h-12 w-full rounded-xl bg-[#5865f2] font-semibold transition hover:brightness-110 active:scale-[0.99]">
              Continue with Discord
            </button>
          </form>
          <div className="my-4 flex items-center gap-3 text-xs text-label-3">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <form
            className="space-y-3"
            action={async (formData) => {
              "use server";
              await signIn("guest", { name: String(formData.get("name") ?? ""), redirectTo: callbackUrl });
            }}
          >
            <input
              name="name"
              required
              minLength={2}
              maxLength={24}
              placeholder="Your name"
              className="h-12 w-full rounded-xl bg-panel-2 px-4 text-base outline-none placeholder:text-label-3 focus:ring-2 focus:ring-accent"
            />
            <button className="h-12 w-full rounded-xl bg-panel-2 font-semibold transition hover:bg-panel-3 active:scale-[0.99]">
              Continue as guest
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-label-2">Guests can watch what the room is watching, talk and chat.</p>
        </div>
      </div>
    </main>
  );
}
