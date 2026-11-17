import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifySessionToken, type SessionPayload } from "@nexus/shared/session-token";
import { clientMessageSchema, isDeviceSource, type ClientMessage, type ServerMessage } from "@nexus/shared";
import { config } from "./config.ts";
import { sendChat, sendChatHistory } from "./chat.ts";
import { removeFromVoice } from "./livekit.ts";
import { guard, log } from "./log.ts";
import { stopScreenShare, syncAllPermissions, syncPermissions } from "./permissions.ts";
import * as rooms from "./rooms.ts";

const MESSAGES_PER_SECOND = 30;

type RoomMessage = Exclude<ClientMessage, { type: "join" | "ping" | "playlist.open" }>;

function send(socket: WebSocket, message: ServerMessage) {
  socket.send(JSON.stringify(message));
}

function handle(roomId: string, user: SessionPayload, message: RoomMessage) {
  switch (message.type) {
    case "stream.add": {
      const result = rooms.addStream(roomId, user, message.source, message.file, message.trackers);
      if (result.ok && isDeviceSource(message.source)) guard("syncPermissions", () => syncPermissions(roomId, user), { roomId });
      return result;
    }
    case "stream.remove": {
      const owner = rooms.localOwnerOf(roomId, message.streamId);
      const result = rooms.removeStream(roomId, user, message.streamId);
      if (result.ok && owner) guard("syncPermissions", () => syncPermissions(roomId, { sub: owner, guest: rooms.isGuest(roomId, owner) }), { roomId });
      return result;
    }
    case "stream.control":
      return rooms.controlStream(roomId, user, message.streamId, message.action, message.position);
    case "stream.establish":
      return rooms.establishStream(roomId, user.sub, message.streamId, message.position);
    case "stream.feature":
      return rooms.featureStream(roomId, user, message.streamId);
    case "role.setController": {
      const result = rooms.setController(roomId, user, message.userId, message.enabled);
      if (result.ok) guard("syncPermissions", () => syncPermissions(roomId, { sub: message.userId, guest: rooms.isGuest(roomId, message.userId) }), { roomId });
      return result;
    }
    case "moderation.set": {
      const result = rooms.setModeration(roomId, user, message.userId, { muted: message.muted, deafened: message.deafened });
      if (result.ok) guard("syncPermissions", () => syncPermissions(roomId, { sub: message.userId, guest: rooms.isGuest(roomId, message.userId) }), { roomId });
      return result;
    }
    case "moderation.kick": {
      const result = rooms.kickUser(roomId, user, message.userId);
      if (result.ok) guard("removeFromVoice", () => removeFromVoice(roomId, message.userId), { roomId });
      return result;
    }
    case "join.respond":
      return rooms.respondToJoin(roomId, user, message.userId, message.allow);
    case "settings.update": {
      const { type: _type, ...patch } = message;
      const result = rooms.updateSettings(roomId, user, patch);
      if (result.ok && patch.sharing !== undefined) guard("syncAllPermissions", () => syncAllPermissions(roomId), { roomId });
      return result;
    }
    case "stream.move":
      return rooms.moveStream(roomId, user, message.streamId, message.direction);
    case "queue.advance":
      return rooms.advanceQueue(roomId, user, message.fromStreamId);
    case "playlist.add":
      return rooms.addPlaylist(roomId, user, message.listId);
    case "playlist.remove":
      return rooms.removePlaylist(roomId, user, message.listId);
    case "queue.addPlaylist":
      return rooms.queuePlaylist(roomId, user, message.listId, message.videoIds, message.position);
    case "queue.addStream":
      return rooms.queueStream(roomId, user, message.streamId, message.position);
    case "queue.remove":
      return rooms.removeQueued(roomId, user, message.queueId);
    case "queue.move":
      return rooms.moveQueued(roomId, user, message.queueId, message.direction);
    case "queue.clear":
      return rooms.clearQueue(roomId, user);
    case "queue.playNow":
      return rooms.playQueuedNow(roomId, user, message.queueId);
    case "reaction.send":
      return rooms.sendReaction(roomId, user, message.emoji);
    case "chat.send":
      return sendChat(roomId, user, message.text);
    case "presence.voice":
      return rooms.setVoiceState(roomId, user.sub, message.deafened);
    case "share.stop": {
      const result = rooms.checkStopShare(roomId, user, message.userId);
      if (result.ok) guard("stopScreenShare", () => stopScreenShare(roomId, message.userId), { roomId });
      return result;
    }
    case "presence.watch":
      return rooms.setWatching(roomId, user.sub, message.streamId);
    case "presence.feed":
      return rooms.setFeed(roomId, user.sub, message.streamId);
    case "tv.output":
      return rooms.setTvOutput(roomId, user.sub, message.mode);
  }
}

export interface WebSocketOptions {
  heartbeatMs?: number;
  handler?: typeof handle;
}

export function attachWebSocket(server: Server, { heartbeatMs = 30_000, handler = handle }: WebSocketOptions = {}) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
  const alive = new WeakSet<WebSocket>();
  let closing: { code: number; reason: string } | null = null;
  wss.on("error", (error) => log.error({ err: error }, "WebSocket server error"));

  // Half-open sockets (a phone asleep, Wi-Fi gone) never send close; drop any that missed a round of pings.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  wss.on("connection", (socket) => {
    let session: { roomId: string; user: SessionPayload } | null = null;
    socket.on("error", (error) => log.warn({ err: error, roomId: session?.roomId }, "WebSocket connection error"));
    if (closing) return socket.close(closing.code, closing.reason);
    let windowStart = Date.now();
    let count = 0;
    alive.add(socket);
    socket.on("pong", () => alive.add(socket));

    socket.on("message", (raw) => {
      alive.add(socket);
      let type: string | undefined;
      const fail = (error: unknown) => {
        log.error({ err: error, roomId: session?.roomId, type }, "WebSocket message failed");
        if (socket.readyState === socket.OPEN) send(socket, { type: "error", message: "Something went wrong" });
      };
      try {
        const now = Date.now();
        if (now - windowStart > 1000) {
          windowStart = now;
          count = 0;
        }
        if (++count > MESSAGES_PER_SECOND) return socket.close(1008, "Rate limited");

        let json: unknown;
        try {
          json = JSON.parse(raw.toString());
        } catch {
          return send(socket, { type: "error", message: "Invalid JSON" });
        }
        const parsed = clientMessageSchema.safeParse(json);
        if (!parsed.success) return send(socket, { type: "error", message: "Invalid message" });
        const message = parsed.data;
        type = message.type;

        if (message.type === "ping") {
          return send(socket, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() });
        }

        if (message.type === "join") {
          if (session) return;
          const user = verifySessionToken(message.ticket, config.AUTH_SECRET);
          if (!user || user.room !== message.roomId) {
            return send(socket, { type: "error", message: "Unauthorized", fatal: true });
          }
          sendChatHistory(message.roomId, user, socket);
          const joined = rooms.connect(message.roomId, user, socket);
          if (joined !== "ok") {
            return send(socket, { type: "error", message: joined === "removed" ? "You were removed from this room" : "Room not found", fatal: true });
          }
          session = { roomId: message.roomId, user };
          return;
        }

        if (!session) return send(socket, { type: "error", message: "Join a room first" });
        if (message.type === "playlist.open") {
          const items = rooms.isMember(session.roomId, session.user.sub) ? rooms.playlistItems(session.roomId, message.listId) : null;
          if (items) send(socket, { type: "playlist.items", listId: message.listId, items });
          return;
        }
        const roomId = session.roomId;
        if (!rooms.isMember(roomId, session.user.sub)) {
          socket.terminate();
          return;
        }
        Promise.resolve(handler(roomId, session.user, message))
          .then((result) => {
            if (!result.ok && socket.readyState === socket.OPEN) send(socket, { type: "error", message: result.message });
          })
          .catch(fail);
      } catch (error) {
        fail(error);
      }
    });

    socket.on("close", () => {
      const current = session;
      if (current) guard("disconnect", () => rooms.disconnect(current.roomId, current.user.sub, socket), { roomId: current.roomId });
    });
  });

  return {
    // New connections are closed straight away with `code`; open ones keep working until closeAll.
    stopAccepting(code: number, reason: string) {
      closing = { code, reason };
    },
    // Closes every socket with `code` and terminates any that have not finished closing after `graceMs`.
    closeAll(code: number, reason: string, graceMs = 1000) {
      closing = { code, reason };
      clearInterval(heartbeat);
      return new Promise<void>((resolve) => {
        wss.close(() => resolve());
        for (const socket of wss.clients) socket.close(code, reason);
        setTimeout(() => {
          for (const socket of wss.clients) socket.terminate();
        }, graceMs).unref();
      });
    },
  };
}
