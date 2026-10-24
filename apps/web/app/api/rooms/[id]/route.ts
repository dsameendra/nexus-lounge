import { roomInfoSchema } from "@nexus/shared";
import { getSessionToken, serverFetch } from "@/lib/server-api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getSessionToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const response = await serverFetch(`/rooms/${encodeURIComponent(id)}`, token);
  if (response.status === 404) return Response.json({ error: "Room not found" }, { status: 404 });
  if (response.status === 429) return Response.json({ error: "Too many attempts. Wait a moment." }, { status: 429 });
  if (!response.ok) return Response.json({ error: "Could not look up that room" }, { status: 502 });
  const room = roomInfoSchema.parse(await response.json());
  return Response.json({ id: room.id, name: room.name, hasPassword: room.hasPassword });
}
