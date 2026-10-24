import { tvCredentialsSchema } from "@nexus/shared";
import { getSessionToken, serverFetch, serverWsUrl } from "@/lib/server-api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getSessionToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const response = await serverFetch(`/rooms/${encodeURIComponent(id)}/tv/session`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await request.json().catch(() => ({}))),
  });
  if (!response.ok) return Response.json(await response.json().catch(() => ({})), { status: response.status });
  return Response.json({ ...tvCredentialsSchema.parse(await response.json()), wsUrl: serverWsUrl() });
}
