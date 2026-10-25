import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifySessionToken, type SessionPayload } from "@nexus/shared/session-token";
import { clientMessageSchema, type ClientMessage, type ServerMessage } from "@nexus/shared";
import { config } from "./config.ts";
import { removeFromVoice } from "./livekit.ts";
import { stopScreenShare, syncAllPermissions, syncPermissions } from "./permissions.ts";
import * as rooms from "./rooms.ts";

const MESSAGES_PER_SECOND = 30;

function send(socket: WebSocket, message: ServerMessage) {
  socket.send(JSON.stringify(message));
}

function handle(roomId: string, user: SessionPayload, message: Exclude<ClientMessage, { type: "join" | "ping" | "playlist.open" }>) {
  switch (message.type) {
    case "stream.add":
      return rooms.addStream(roomId, user, message.source);
    case "stream.remove":
      return rooms.removeStream(roomId, user, message.streamId);
    case "stream.control":
      return rooms.controlStream(roomId, user, message.streamId, message.action, message.position);
    case "stream.establish":
      return rooms.establishStream(roomId, message.streamId, message.position);
    case "stream.feature":
      return rooms.featureStream(roomId, user, message.streamId);
    case "role.setController": {
      const result = rooms.setController(roomId, user, message.userId, message.enabled);
      if (result.ok) void syncPermissions(roomId, { sub: message.userId, guest: rooms.isGuest(roomId, message.userId) });
      return result;
    }
    case "moderation.set": {
      const result = rooms.setModeration(roomId, user, message.userId, { muted: message.muted, deafened: message.deafened });
      if (result.ok) void syncPermissions(roomId, { sub: message.userId, guest: rooms.isGuest(roomId, message.userId) });
      return result;
    }
    case "moderation.kick": {
      const result = rooms.kickUser(roomId, user, message.userId);
      if (result.ok) void removeFromVoice(roomId, message.userId);
      return result;
    }
    case "join.respond":
      return rooms.respondToJoin(roomId, user, message.userId, message.allow);
    case "settings.update": {
      const { type: _type, ...patch } = message;
      const result = rooms.updateSettings(roomId, user, patch);
      if (result.ok && patch.sharing !== undefined) void syncAllPermissions(roomId);
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
    case "presence.voice":
      return rooms.setVoiceState(roomId, user.sub, message.deafened);
    case "share.stop": {
      const result = rooms.checkStopShare(roomId, user, message.userId);
      if (result.ok) void stopScreenShare(roomId, message.userId);
      return result;
    }
    case "presence.watch":
      return rooms.setWatching(roomId, user.sub, message.streamId);
    case "tv.output":
      return rooms.setTvOutput(roomId, user.sub, message.mode);
  }
}

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });

  wss.on("connection", (socket) => {
    let session: { roomId: string; user: SessionPayload } | null = null;
    let windowStart = Date.now();
    let count = 0;

    socket.on("message", (raw) => {
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

      if (message.type === "ping") {
        return send(socket, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() });
      }

      if (message.type === "join") {
        if (session) return;
        const user = verifySessionToken(message.ticket, config.AUTH_SECRET);
        if (!user || user.room !== message.roomId) {
          return send(socket, { type: "error", message: "Unauthorized", fatal: true });
        }
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
      void Promise.resolve(handle(roomId, session.user, message)).then((result) => {
        if (!result.ok && socket.readyState === socket.OPEN) send(socket, { type: "error", message: result.message });
      });
    });

    socket.on("close", () => {
      if (session) rooms.disconnect(session.roomId, session.user.sub, socket);
    });
  });
}
