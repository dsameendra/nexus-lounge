import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RoomClient } from "@/components/RoomClient";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/room/${id}`)}`);
  return (
    <RoomClient
      roomId={id}
      self={{ id: session.user.id, name: session.user.name ?? "You", image: session.user.image ?? null, guest: session.user.id.startsWith("guest-") }}
    />
  );
}
