import { adminActionContext, sameSecret, trustedOrigin } from "@/lib/admin";

export const notFound = () => new Response("Not Found", { status: 404, headers: { "cache-control": "private, no-store" } });
export const json = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

// Shared gate for destructive admin routes. Returns the admin id and parsed JSON body, or the response to send.
export async function gate(request: Request): Promise<{ sub: string; body: unknown } | Response> {
  if (!trustedOrigin(request)) return notFound();
  if (!request.headers.get("content-type")?.startsWith("application/json")) return notFound();
  const context = await adminActionContext();
  if (!context) return notFound();
  if (!sameSecret(request.headers.get("x-admin-csrf") ?? "", context.csrf)) return notFound();
  if (!context.fresh) return json({ error: "reauth" }, 403);
  return { sub: context.sub, body: await request.json().catch(() => null) };
}

export async function relay(response: Response | null) {
  if (!response) return json({ error: "unavailable" }, 502);
  if (response.status === 404) return notFound();
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.ok) return json({ ok: true });
  if (response.status === 409 || response.status === 429) return json({ error: data.error ?? "failed" }, response.status);
  return json({ error: "failed" }, 502);
}
