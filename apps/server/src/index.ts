import Fastify, { type FastifyRequest } from "fastify";
import { verifySessionToken } from "@nexus/shared/session-token";
import { roomIdSchema } from "@nexus/shared";
import { config } from "./config.ts";
import { createLivekitToken } from "./livekit.ts";
import { createRoom, getRoom } from "./rooms.ts";
import { attachWebSocket } from "./ws.ts";

const app = Fastify({ logger: true });

function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifySessionToken(header.slice(7), config.AUTH_SECRET);
}

app.get("/health", async () => ({ ok: true }));

app.post("/rooms", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  return reply.code(201).send(createRoom(user.sub));
});

app.get<{ Params: { id: string } }>("/rooms/:id", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  const room = roomIdSchema.safeParse(request.params.id).success ? getRoom(request.params.id) : undefined;
  if (!room) return reply.code(404).send({ error: "Room not found" });
  return room;
});

app.post<{ Params: { id: string } }>("/rooms/:id/livekit-token", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  const room = roomIdSchema.safeParse(request.params.id).success ? getRoom(request.params.id) : undefined;
  if (!room) return reply.code(404).send({ error: "Room not found" });
  return { token: await createLivekitToken(room.id, user), url: config.LIVEKIT_URL, room };
});

attachWebSocket(app.server);

await app.listen({ port: config.PORT, host: "0.0.0.0" });
