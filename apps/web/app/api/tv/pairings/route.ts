import { tvPairingSchema } from "@nexus/shared";
import { serverHttpUrl } from "@/lib/server-api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { roomId?: unknown } | null;
  const response = await fetch(`${serverHttpUrl()}/tv/pairings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId: body?.roomId }),
    cache: "no-store",
  });
  if (!response.ok) return Response.json(await response.json().catch(() => ({ error: "Failed" })), { status: response.status });
  return Response.json(tvPairingSchema.parse(await response.json()), { status: 201 });
}
