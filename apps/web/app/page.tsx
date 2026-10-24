import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { CreateRoomButton } from "@/components/CreateRoomButton";
import { Logo } from "@/components/Logo";
import { InstallPrompt } from "@/components/InstallPrompt";
import { JoinRoomForm } from "@/components/JoinRoomForm";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const guest = session.user.id.startsWith("guest-");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={84} />
          <h1 className="mt-5 text-4xl font-bold tracking-tight">Nexus Lounge</h1>
          <p className="mt-2 text-label-2">
            Signed in as <span className="text-white">{session.user.name}</span>
            {guest && " (guest)"}
          </p>
        </div>
        <div className="rounded-[var(--radius-sheet)] bg-panel p-5">
          {guest ? (
            <p className="mb-4 text-center text-sm text-label-2">Guests can join rooms. Sign in with Discord to create your own.</p>
          ) : (
            <>
              <CreateRoomButton />
              <div className="my-4 flex items-center gap-3 text-xs text-label-3">
                <span className="h-px flex-1 bg-line" />
                or join a room
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
          <JoinRoomForm />
        </div>
        <InstallPrompt />
        <form
          className="mt-5 text-center"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="text-sm text-label-2 transition hover:text-white">Sign out</button>
        </form>
      </div>
    </main>
  );
}
