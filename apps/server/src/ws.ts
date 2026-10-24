import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifySessionToken } from "@nexus/shared/session-token";
import { clientMessageSchema, type ServerMessage } from "@nexus/shared";
import { config } from "./config.ts";
import { getRoom } from "./rooms.ts";

function send(socket: WebSocket, message: ServerMessage) {
  socket.send(JSON.stringify(message));
}

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });

  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
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

      const user = verifySessionToken(message.token, config.AUTH_SECRET);
      const room = getRoom(message.roomId);
      if (!user) return send(socket, { type: "error", message: "Unauthorized" });
      if (!room) return send(socket, { type: "error", message: "Room not found" });
      send(socket, { type: "room", room });
    });
  });
}
