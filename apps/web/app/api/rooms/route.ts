import { roomInfoSchema } from "@nexus/shared";
import { getSessionToken, serverFetch } from "@/lib/server-api";

export async function POST() {
  const token = await getSessionToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const response = await serverFetch("/rooms", token, { method: "POST" });
  if (!response.ok) return Response.json({ error: "Could not create room" }, { status: 502 });
  return Response.json(roomInfoSchema.parse(await response.json()), { status: 201 });
}
