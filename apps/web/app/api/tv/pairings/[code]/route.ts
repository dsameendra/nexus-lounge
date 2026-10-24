import { tvPollSchema } from "@nexus/shared";
import { serverHttpUrl, serverWsUrl } from "@/lib/server-api";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const response = await fetch(`${serverHttpUrl()}/tv/pairings/${encodeURIComponent(code)}`, {
    headers: { "x-pairing-secret": request.headers.get("x-pairing-secret") ?? "" },
    cache: "no-store",
  });
  if (!response.ok) return Response.json({ error: "Code expired" }, { status: response.status });
  const poll = tvPollSchema.parse(await response.json());
  return Response.json(poll.status === "approved" ? { ...poll, wsUrl: serverWsUrl() } : poll);
}
