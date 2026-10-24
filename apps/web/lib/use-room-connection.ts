"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { serverMessageSchema, type ClientMessage, type RoomState } from "@nexus/shared";
import { ClockSync } from "./clock";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "failed";

export interface RoomConnection {
  state: RoomState | null;
  status: ConnectionStatus;
  clock: ClockSync;
  send: (message: ClientMessage) => void;
  lastError: { message: string; at: number } | null;
}

const INITIAL_PINGS = 8;
const PING_INTERVAL_MS = 15000;

export function useRoomConnection(roomId: string, ticket: string, wsUrl: string): RoomConnection {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<RoomConnection["lastError"]>(null);
  const clockRef = useRef<ClockSync>(new ClockSync());
  const socketRef = useRef<WebSocket | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    const clock = clockRef.current;

    const connect = () => {
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
        }
        if (message.type === "error") {
          setLastError({ message: message.message, at: Date.now() });
          if (message.fatal) {
            closed = true;
            setStatus("failed");
            socket.close();
          }
        }
      };

      socket.onclose = () => {
        clearInterval(pingTimer);
        if (closed) return;
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, Math.min(5000, 400 * 2 ** attempt++));
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId, ticket, wsUrl]);

  return { state, status, clock: clockRef.current, send, lastError };
}
