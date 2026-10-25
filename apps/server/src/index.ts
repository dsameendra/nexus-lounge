import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { signSessionToken, verifySessionToken } from "@nexus/shared/session-token";
import { createRoomRequestSchema, joinRoomRequestSchema, roomIdSchema, tvCodeSchema } from "@nexus/shared";
import { z } from "zod";
import { MEMBER_REF, ROOM_ID, verifyAdminRequest, type AdminAct } from "@nexus/shared/admin-token";
import { adminEnabled, adminIds, config } from "./config.ts";
import { closeVoiceRoom, createLivekitToken, reconcileVoice, removeFromVoice } from "./livekit.ts";
import { activeRoomOf, adminCloseRoom, adminOverview, adminRemoveMember, blockedRemovals, hasRoom, roomCount, checkEntry, checkRoomAccess, forgetUser, createRoom, getRoom, isMember, pruneReactionHistory, pruneStalePending, publishInputs, requestEntry } from "./rooms.ts";
import { allowAttempt, approvePairing, dropPairings, createPairing, mintCredentials, pollPairing } from "./tv.ts";
import { sweepEmptyRooms } from "./rooms.ts";
import { attachWebSocket } from "./ws.ts";

const app = Fastify({ logger: true, trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS });

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

const seenAdminTokens = new Map<string, number>();
const maskIp = (ip: string) => ip.replace(/(\d+\.\d+\.\d+)\.\d+$/, "$1.x").replace(/(:[0-9a-f]*){4}$/i, ":x");

// Registered only when ADMIN_SECRET and ADMIN_DISCORD_IDS are set. Authentication failures are the stock 404;
// once authenticated, results are JSON (gone = target no longer exists).
if (adminEnabled) {
  const denyOrClaims = (request: FastifyRequest, expected: (act: AdminAct) => boolean) => {
    const header = request.headers.authorization;
    const claims = header?.startsWith("Bearer ") ? verifyAdminRequest(header.slice(7), config.ADMIN_SECRET!) : null;
    const now = Date.now();
    for (const [jti, expires] of seenAdminTokens) if (expires < now) seenAdminTokens.delete(jti);
    if (!claims || !adminIds.has(claims.sub) || seenAdminTokens.has(claims.jti) || !expected(claims)) {
      app.log.warn({ admin: "denied", ip: maskIp(request.ip) }, "admin request denied");
      return null;
    }
    seenAdminTokens.set(claims.jti, now + 130_000);
    return claims;
  };

  app.get("/admin/overview", { logLevel: "warn" }, async (request, reply) => {
    const claims = denyOrClaims(request, (act) => act.act === "view");
    if (!claims) return reply.callNotFound();
    app.log.warn({ admin: "ok", ip: maskIp(request.ip) }, "admin overview served");
    return reply
      .header("cache-control", "private, no-store")
      .header("x-robots-tag", "noindex, nofollow")
      .header("vary", "authorization")
      .send(adminOverview(config.ADMIN_SECRET!));
  });

  const actionReply = (reply: FastifyReply) => reply.header("cache-control", "private, no-store").header("x-robots-tag", "noindex, nofollow");

  app.post<{ Params: { roomId: string } }>("/admin/rooms/:roomId/close", { logLevel: "warn" }, async (request, reply) => {
    const roomId = request.params.roomId;
    const claims = denyOrClaims(request, (act) => act.act === "close" && act.room === roomId && ROOM_ID.test(roomId));
    if (!claims) return reply.callNotFound();
    if (!allowAttempt(`admin-act:${claims.sub}`, 20) || !allowAttempt("admin-act:all", 60)) return actionReply(reply).code(429).send({ error: "slow_down" });
    const result = adminCloseRoom(roomId);
    app.log.warn({ admin: "action", action: "close", roomId, outcome: result.status, ip: maskIp(request.ip) }, "admin closed a room");
    if (result.status === "gone") return actionReply(reply).code(409).send({ error: "gone" });
    dropPairings(roomId);
    const voice = await closeVoiceRoom(roomId);
    return actionReply(reply).send({ ok: true, removed: result.voiceIds.length, voice });
  });

  app.post<{ Params: { roomId: string }; Body: unknown }>("/admin/rooms/:roomId/remove", { logLevel: "warn" }, async (request, reply) => {
    const roomId = request.params.roomId;
    const body = z.object({ ref: z.string().regex(MEMBER_REF) }).strict().safeParse(request.body);
    const ref = body.success ? body.data.ref : null;
    const claims = ref ? denyOrClaims(request, (act) => act.act === "remove" && act.room === roomId && act.ref === ref) : null;
    if (!claims || !ref) return reply.callNotFound();
    if (!allowAttempt(`admin-act:${claims.sub}`, 20) || !allowAttempt("admin-act:all", 60)) return actionReply(reply).code(429).send({ error: "slow_down" });
    const result = adminRemoveMember(roomId, ref, config.ADMIN_SECRET!);
    app.log.warn({ admin: "action", action: "remove", roomId, outcome: result.status, ip: maskIp(request.ip) }, "admin removed a person");
    if (result.status !== "ok") return actionReply(reply).code(409).send({ error: result.status });
    const voice = (await Promise.all(result.voiceIds.map((id) => removeFromVoice(roomId, id)))).length;
    return actionReply(reply).send({ ok: true, voice });
  });

  setInterval(() => void reconcileVoice(hasRoom, blockedRemovals()), 30_000).unref();
}

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
  const token = await createLivekitToken(room.id, user, publishInputs(room.id, user));
  if (!getRoom(room.id)) return reply.code(404).send({ error: "Room not found" });
  return { token, url: config.LIVEKIT_URL, room, wsTicket };
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
