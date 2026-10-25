import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountClient } from "@/components/AccountClient";

export const metadata = { title: "Account · Nexus Lounge" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/account");
  return <AccountClient name={session.user.name ?? ""} image={session.user.image ?? null} guest={session.user.id.startsWith("guest-")} id={session.user.id} />;
}
