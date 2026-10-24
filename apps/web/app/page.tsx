import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { CreateRoomButton } from "@/components/CreateRoomButton";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8">
        <h1 className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-3xl font-bold text-transparent">
          Nexus Lounge
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Signed in as <span className="text-slate-200">{session.user.name}</span>
        </p>
        <CreateRoomButton />
        <form
          className="mt-4"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="text-sm text-slate-500 hover:text-slate-300">Sign out</button>
        </form>
      </div>
    </main>
  );
}
