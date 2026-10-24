import { joinRoomRequestSchema, livekitTokenResponseSchema } from "@nexus/shared";
import { getSessionToken, serverFetch } from "@/lib/server-api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getSessionToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const response = await serverFetch(`/rooms/${encodeURIComponent(id)}/livekit-token`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(joinRoomRequestSchema.parse(await request.json().catch(() => ({})))),
  });
  if (response.status === 404) return Response.json({ error: "Room not found" }, { status: 404 });
  if (response.status === 403) return Response.json(await response.json(), { status: 403 });
  if (!response.ok) return Response.json({ error: "Could not join room" }, { status: 502 });
  return Response.json(livekitTokenResponseSchema.parse(await response.json()));
}
