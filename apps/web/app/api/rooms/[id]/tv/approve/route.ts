import { getSessionToken, serverFetch } from "@/lib/server-api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getSessionToken();
  if (!token) return Response.json({ error: "Sign in first" }, { status: 401 });
  const response = await serverFetch(`/rooms/${encodeURIComponent(id)}/tv/approve`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await request.json().catch(() => ({}))),
  });
  return Response.json(await response.json().catch(() => ({})), { status: response.status });
}
