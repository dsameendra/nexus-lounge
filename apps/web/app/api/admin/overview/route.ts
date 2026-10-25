import { adminSession, fetchOverview } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new Response("Not Found", { status: 404, headers: { "cache-control": "private, no-store" } });

export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return notFound();
  const sub = await adminSession();
  if (!sub) return notFound();
  const response = await fetchOverview(sub);
  if (!response?.ok) return notFound();
  return new Response(await response.text(), {
    headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" },
  });
}
