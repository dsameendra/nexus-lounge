import { z } from "zod";
import { auth, signOut, unstable_update } from "@/auth";
import { isPresetAvatar } from "@/lib/avatars";
import { getSessionToken, serverFetch } from "@/lib/server-api";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(24),
  avatar: z.string().nullable().refine((value) => value === null || isPresetAvatar(value)),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = profileSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Names are 2 to 24 characters." }, { status: 400 });
  const profile = { name: body.data.name, ...(body.data.avatar ? { image: body.data.avatar } : {}) };
  await unstable_update({ profile } as never);
  return Response.json({ ok: true });
}

export async function DELETE() {
  const token = await getSessionToken();
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const response = await serverFetch("/account/delete", token, { method: "POST" }).catch(() => null);
  if (response?.status === 409) return Response.json({ error: "in_room" }, { status: 409 });
  if (!response?.ok) return Response.json({ error: "Couldn't delete your account. Try again." }, { status: 502 });
  await signOut({ redirect: false });
  return Response.json({ ok: true });
}
