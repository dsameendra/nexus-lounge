import { signSessionToken } from "@nexus/shared/session-token";
import { auth } from "@/auth";

const wsUrl = process.env.NEXT_PUBLIC_SERVER_WS_URL ?? "ws://localhost:4000/ws";
export const serverHttpUrl = wsUrl.replace(/^ws/, "http").replace(/\/ws$/, "");

export async function getSessionToken() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return signSessionToken(
    {
      sub: session.user.id,
      name: session.user.name ?? "Unknown",
      image: session.user.image ?? null,
      guest: session.user.id.startsWith("guest-"),
    },
    process.env.AUTH_SECRET!,
  );
}

export async function serverFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`${serverHttpUrl}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
