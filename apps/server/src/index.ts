import Fastify, { type FastifyRequest } from "fastify";
import { verifySessionToken } from "@nexus/shared/session-token";
import { createRoomRequestSchema, joinRoomRequestSchema, roomIdSchema } from "@nexus/shared";
import { config } from "./config.ts";
import { createLivekitToken } from "./livekit.ts";
import { checkRoomAccess, createRoom, getRoom } from "./rooms.ts";
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
  const body = createRoomRequestSchema.safeParse(request.body ?? {});
  if (!body.success) return reply.code(400).send({ error: "Invalid request" });
  return reply.code(201).send(createRoom(user.sub, body.data.password));
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
  const body = joinRoomRequestSchema.safeParse(request.body ?? {});
  if (!body.success) return reply.code(400).send({ error: "Invalid request" });
  const access = checkRoomAccess(room.id, user.sub, body.data.password);
  if (access === "password_required" || access === "wrong_password") return reply.code(403).send({ error: access });
  return { token: await createLivekitToken(room.id, user), url: config.LIVEKIT_URL, room };
});

attachWebSocket(app.server);

await app.listen({ port: config.PORT, host: "0.0.0.0" });
