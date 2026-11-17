"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeChat, serverMessageSchema, type ChatLine, type ClientMessage, type PlaylistItem, type ReactionEmoji, type RoomState } from "@nexus/shared";
import { reconnectDelay } from "./backoff";
import { ClockSync } from "./clock";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "failed" | "kicked";

export interface ReactionEvent {
  id: string;
  emoji: ReactionEmoji;
  from: { id: string; name: string };
}

// `live` lines arrived while connected; history (on join or reconnect) never counts as unread.
export type ChatEntry = ChatLine & { live?: boolean };

export interface RoomConnection {
  state: RoomState | null;
  status: ConnectionStatus;
  clock: ClockSync;
  send: (message: ClientMessage) => void;
  lastError: { message: string; at: number } | null;
  playlistItems: Record<string, PlaylistItem[]>;
  openPlaylist: (listId: string) => void;
  onReaction: (listener: (reaction: ReactionEvent) => void) => () => void;
  // The server said it is restarting (or closed with 1012); true until a fresh state arrives.
  restarting: boolean;
  chat: ChatEntry[];
  sendChat: (text: string) => boolean;
}

const INITIAL_PINGS = 8;
const PING_INTERVAL_MS = 15000;
// Sent by the server when it closes sockets for a planned restart.
const CLOSE_SERVICE_RESTART = 1012;

export function useRoomConnection(roomId: string, ticket: string, wsUrl: string): RoomConnection {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<RoomConnection["lastError"]>(null);
  const [playlistItems, setPlaylistItems] = useState<Record<string, PlaylistItem[]>>({});
  const [restarting, setRestarting] = useState(false);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const clockRef = useRef<ClockSync>(new ClockSync());
  const socketRef = useRef<WebSocket | null>(null);
  const reactionListeners = useRef(new Set<(reaction: ReactionEvent) => void>());

  const onReaction = useCallback((listener: (reaction: ReactionEvent) => void) => {
    reactionListeners.current.add(listener);
    return () => {
      reactionListeners.current.delete(listener);
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const sendChat = useCallback((text: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: "chat.send", text } satisfies ClientMessage));
    return true;
  }, []);

  const openPlaylist = useCallback(
    (listId: string) => {
      send({ type: "playlist.open", listId });
    },
    [send],
  );

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    const clock = clockRef.current;

    const connect = () => {
      retryTimer = undefined;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      const ping = () => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
      };

      socket.onopen = () => {
        attempt = 0;
        clock.reset();
        socket.send(JSON.stringify({ type: "join", roomId, ticket }));
        for (let i = 0; i < INITIAL_PINGS; i++) setTimeout(ping, i * 120);
        pingTimer = setInterval(ping, PING_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        let json: unknown;
        try {
          json = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const parsed = serverMessageSchema.safeParse(json);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "pong") clock.addSample(message.clientTime, message.serverTime, Date.now());
        if (message.type === "state") {
          setState(message.state);
          setStatus("open");
          setRestarting(false);
        }
        if (message.type === "playlist.items") setPlaylistItems((previous) => ({ ...previous, [message.listId]: message.items }));
        if (message.type === "restarting") setRestarting(true);
        if (message.type === "chat") setChat((previous) => mergeChat(previous, [{ ...message.line, live: true }]));
        if (message.type === "chat.history") setChat((previous) => mergeChat(previous, message.lines));
        if (message.type === "reaction") reactionListeners.current.forEach((listener) => listener(message));
        if (message.type === "kicked") {
          closed = true;
          setRestarting(false);
          setStatus("kicked");
          socket.close();
        }
        if (message.type === "error") {
          setLastError({ message: message.message, at: Date.now() });
          if (message.fatal) {
            closed = true;
            setRestarting(false);
            setStatus(/removed|closed/.test(message.message) ? "kicked" : "failed");
            socket.close();
          }
        }
      };

      socket.onclose = (event) => {
        clearInterval(pingTimer);
        if (closed) return;
        // A planned restart reconnects like any other close, starting the backoff over.
        if (event.code === CLOSE_SERVICE_RESTART) {
          attempt = 0;
          setRestarting(true);
        }
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, reconnectDelay(attempt++));
      };
    };

    // Coming back online or to the tab: skip the rest of the wait. Only while a retry is pending, so never two sockets.
    const retryNow = () => {
      if (closed || retryTimer === undefined || document.visibilityState === "hidden") return;
      clearTimeout(retryTimer);
      connect();
    };

    connect();
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", retryNow);
    return () => {
      closed = true;
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", retryNow);
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId, ticket, wsUrl]);

  return { state, status, clock: clockRef.current, send, lastError, playlistItems, openPlaylist, onReaction, restarting, chat, sendChat };
}
