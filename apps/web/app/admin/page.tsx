import { notFound, redirect } from "next/navigation";
import { AdminClient } from "@/components/AdminClient";
import { adminIdentity, adminSession, pageCsrf } from "@/lib/admin";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  if (!(await adminIdentity())) notFound();
  if (!(await adminSession())) redirect("/admin/login");
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <form action={logoutAction}>
          <button className="h-10 rounded-full bg-white/10 px-4 text-sm font-medium transition hover:bg-white/15 active:scale-95">Lock</button>
        </form>
      </div>
      <AdminClient csrf={await pageCsrf()} />
    </main>
  );
}
