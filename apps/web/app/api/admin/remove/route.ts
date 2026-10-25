import { z } from "zod";
import { postAction } from "@/lib/admin";
import { gate, notFound, relay } from "../_action";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ room: z.string().regex(/^[a-z0-9]{8}$/), ref: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }).strict();

export async function POST(request: Request) {
  const checked = await gate(request);
  if (checked instanceof Response) return checked;
  const body = bodySchema.safeParse(checked.body);
  if (!body.success) return notFound();
  const { room, ref } = body.data;
  return relay(await postAction(checked.sub, `/admin/rooms/${room}/remove`, { act: "remove", room, ref }, { ref }));
}
