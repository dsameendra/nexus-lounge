import type { Metadata } from "next";
import { auth } from "@/auth";
import { TvClient } from "@/components/TvClient";

export const metadata: Metadata = { title: "Nexus Lounge TV" };

export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  return <TvClient roomId={id} signedIn={Boolean(session?.user)} />;
}
