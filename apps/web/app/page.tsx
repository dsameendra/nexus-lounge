import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { CreateRoomButton } from "@/components/CreateRoomButton";
import { InstallPrompt } from "@/components/InstallPrompt";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const guest = session.user.id.startsWith("guest-");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Nexus Lounge</h1>
          <p className="mt-2 text-label-2">
            Signed in as <span className="text-white">{session.user.name}</span>
            {guest && " (guest)"}
          </p>
        </div>
        <div className="rounded-[var(--radius-sheet)] bg-panel p-5">
          {guest ? (
            <p className="py-2 text-center text-sm text-label-2">
              Guests can join rooms from an invite link. Sign in with Discord to create your own room.
            </p>
          ) : (
            <CreateRoomButton />
          )}
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
