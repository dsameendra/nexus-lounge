import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import { appendChat, cleanChatText, stripInvisible, type ChatLine, type ServerMessage } from "@nexus/shared";
import type { SessionPayload } from "@nexus/shared/session-token";
import { allowAttempt } from "./rate-limit.ts";
import { chatRoom } from "./rooms.ts";

const CHAT_LIMIT = 8;
const CHAT_WINDOW_MS = 10_000;

type Result = { ok: true } | { ok: false; message: string };

// TVs only show the picture: they never send or receive chat.
function readers(roomId: string) {
  const room = chatRoom(roomId);
  return room ? [...room.connections.values()].filter(({ member }) => member.tvMode === null) : [];
}

export function sendChat(roomId: string, user: SessionPayload, text: string): Result {
  const room = chatRoom(roomId);
  if (!room || !room.connections.has(user.sub)) return { ok: false, message: "Join the room first" };
  if (user.tv) return { ok: false, message: "TVs can't send messages" };
  const cleaned = cleanChatText(text);
  if (!cleaned) return { ok: false, message: "Messages need some text and can be up to 500 characters" };
  if (!allowAttempt(`chat:${roomId}:${user.sub}`, CHAT_LIMIT, CHAT_WINDOW_MS)) return { ok: false, message: "You're sending messages too fast. Wait a moment." };

  const line: ChatLine = {
    id: randomBytes(8).toString("hex"),
    from: { id: user.sub, name: stripInvisible(user.name).trim().slice(0, 48) || "Someone" },
    text: cleaned,
    at: Date.now(),
  };
  room.chat = appendChat(room.chat, line);
  const payload = JSON.stringify({ type: "chat", line } satisfies ServerMessage);
  for (const connection of readers(roomId)) {
    for (const socket of connection.sockets) if (socket.readyState === socket.OPEN) socket.send(payload);
  }
  return { ok: true };
}

export function sendChatHistory(roomId: string, user: SessionPayload, socket: WebSocket) {
  const room = chatRoom(roomId);
  if (!room || user.tv || socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify({ type: "chat.history", lines: room.chat } satisfies ServerMessage));
}
