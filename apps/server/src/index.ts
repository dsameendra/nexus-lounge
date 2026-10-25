import Fastify, { type FastifyRequest } from "fastify";
import { signSessionToken, verifySessionToken } from "@nexus/shared/session-token";
import { createRoomRequestSchema, joinRoomRequestSchema, roomIdSchema, tvCodeSchema } from "@nexus/shared";
import { z } from "zod";
import { config } from "./config.ts";
import { createLivekitToken } from "./livekit.ts";
import { activeRoomOf, roomCount, checkEntry, checkRoomAccess, forgetUser, createRoom, getRoom, isMember, pruneReactionHistory, pruneStalePending, publishInputs, requestEntry } from "./rooms.ts";
import { allowAttempt, approvePairing, createPairing, mintCredentials, pollPairing } from "./tv.ts";
import { sweepEmptyRooms } from "./rooms.ts";
import { attachWebSocket } from "./ws.ts";

const app = Fastify({ logger: true, trustProxy: true });

function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const user = verifySessionToken(header.slice(7), config.AUTH_SECRET);
  return user && !user.room ? user : null;
}

app.post("/account/delete", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  if (activeRoomOf(user.sub)) return reply.code(409).send({ error: "in_room" });
  forgetUser(user.sub);
  return { ok: true };
});

app.get("/health", async () => ({ ok: true }));

app.post("/rooms", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  if (user.guest) return reply.code(403).send({ error: "Sign in with Discord to create a room" });
  if (!allowAttempt(`create:${user.sub}`, 40)) return reply.code(429).send({ error: "You're creating rooms too quickly. Wait a moment." });
  const body = createRoomRequestSchema.safeParse(request.body ?? {});
  if (!body.success) return reply.code(400).send({ error: "Invalid request" });
  if (roomCount() >= 2000) return reply.code(503).send({ error: "The server is busy. Try again later." });
  return reply.code(201).send(createRoom(user.sub, body.data.password, body.data.name));
});

app.get<{ Params: { id: string } }>("/rooms/:id", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  if (!allowAttempt(`lookup:${user.sub}`, 30)) return reply.code(429).send({ error: "Too many attempts. Wait a moment." });
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
  if (body.data.password && (!allowAttempt(`pw:${user.sub}:${room.id}`, 8) || !allowAttempt(`pwip:${request.ip}:${room.id}`, 30))) {
    return reply.code(429).send({ error: "Too many attempts. Wait a moment." });
  }
  const access = checkRoomAccess(room.id, user.sub, body.data.password);
  if (access === "password_required" || access === "wrong_password") return reply.code(403).send({ error: access });
  const entry = requestEntry(room.id, user);
  if (entry === "removed" || entry === "declined" || entry === "locked" || entry === "closed") return reply.code(403).send({ error: entry });
  if (entry === "pending") return reply.code(202).send({ status: "pending" });
  const wsTicket = signSessionToken({ ...user, room: room.id }, config.AUTH_SECRET, 6 * 60 * 60);
  return { token: await createLivekitToken(room.id, user, publishInputs(room.id, user)), url: config.LIVEKIT_URL, room, wsTicket };
});

app.post("/tv/pairings", async (request, reply) => {
  if (!allowAttempt(`pair:${request.ip}`)) return reply.code(429).send({ error: "Too many attempts" });
  const body = z.object({ roomId: roomIdSchema }).safeParse(request.body);
  if (!body.success || !getRoom(body.data.roomId)) return reply.code(404).send({ error: "Room not found" });
  const pairing = createPairing(body.data.roomId);
  if (!pairing) return reply.code(503).send({ error: "Try again in a moment" });
  return reply.code(201).send(pairing);
});

app.get<{ Params: { code: string } }>("/tv/pairings/:code", async (request, reply) => {
  if (!allowAttempt(`poll:${request.ip}`, 120)) return reply.code(429).send({ error: "Too many attempts" });
  const secret = request.headers["x-pairing-secret"];
  const result = tvCodeSchema.safeParse(request.params.code).success && typeof secret === "string" ? pollPairing(request.params.code, secret) : "invalid";
  if (result === "invalid") return reply.code(404).send({ error: "Code expired" });
  return result;
});

app.post<{ Params: { id: string } }>("/rooms/:id/tv/approve", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  if (!allowAttempt(`approve:${user.sub}`)) return reply.code(429).send({ error: "Too many attempts" });
  const roomId = request.params.id;
  if (!isMember(roomId, user.sub)) return reply.code(403).send({ error: "Join the room first" });
  const body = z.object({ code: tvCodeSchema }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Enter the 6-character code from your TV" });
  if (!(await approvePairing(body.data.code.toUpperCase(), roomId, user.name, user.sub))) {
    return reply.code(404).send({ error: "That code isn't valid or has expired" });
  }
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/rooms/:id/tv/session", async (request, reply) => {
  const user = authenticate(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  const room = roomIdSchema.safeParse(request.params.id).success ? getRoom(request.params.id) : undefined;
  if (!room) return reply.code(404).send({ error: "Room not found" });
  const body = joinRoomRequestSchema.safeParse(request.body ?? {});
  if (!body.success) return reply.code(400).send({ error: "Invalid request" });
  if (body.data.password && (!allowAttempt(`pw:${user.sub}:${room.id}`, 8) || !allowAttempt(`pwip:${request.ip}:${room.id}`, 30))) {
    return reply.code(429).send({ error: "Too many attempts. Wait a moment." });
  }
  const access = checkRoomAccess(room.id, user.sub, body.data.password);
  if (access === "password_required" || access === "wrong_password") return reply.code(403).send({ error: access });
  const entry = checkEntry(room.id, user);
  if (entry === "pending") return reply.code(403).send({ error: "not_admitted" });
  if (entry !== "ok") return reply.code(403).send({ error: entry });
  return mintCredentials(room.id, user.name, user.sub);
});

attachWebSocket(app.server);
setInterval(sweepEmptyRooms, 5 * 60 * 1000).unref();
setInterval(pruneStalePending, 5000).unref();
setInterval(pruneReactionHistory, 30_000).unref();

await app.listen({ port: config.PORT, host: "0.0.0.0" });
