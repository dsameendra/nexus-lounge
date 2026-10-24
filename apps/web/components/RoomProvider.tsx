"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Member, RoomState, Stream } from "@nexus/shared";
import { useRoomConnection, type RoomConnection } from "@/lib/use-room-connection";

export interface Self {
  id: string;
  name: string;
  image: string | null;
  guest: boolean;
}

interface RoomContextValue extends RoomConnection {
  state: RoomState;
  self: Self;
  isHost: boolean;
  isController: boolean;
  canAdd: boolean;
  selectedId: string | null;
  select: (id: string | null) => void;
  canControlStream: (stream: Stream) => boolean;
  memberById: (id: string) => Member | undefined;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({
  roomId,
  ticket,
  wsUrl,
  self,
  children,
  fallback,
}: {
  roomId: string;
  ticket: string;
  wsUrl: string;
  self: Self;
  children: React.ReactNode;
  fallback: (status: RoomConnection["status"]) => React.ReactNode;
}) {
  const connection = useRoomConnection(roomId, ticket, wsUrl);
  const [selection, setSelection] = useState<string | null>(null);
  const { state } = connection;

  const select = useCallback((id: string | null) => setSelection(self.guest ? null : id), [self.guest]);

  const value = useMemo<RoomContextValue | null>(() => {
    if (!state) return null;
    const isHost = state.room.hostId === self.id;
    const isController = isHost || state.room.controllerIds.includes(self.id);
    const selectedId = selection && (selection === "screen" || state.streams.some((s) => s.id === selection)) ? selection : null;
    return {
      ...connection,
      state,
      self,
      isHost,
      isController,
      canAdd: !self.guest,
      selectedId,
      select,
      canControlStream: (stream) => !self.guest && (isController || stream.addedBy.id === self.id),
      memberById: (id) => state.members.find((member) => member.id === id),
    };
  }, [connection, state, self, selection, select]);

  if (!value) return <>{fallback(connection.status)}</>;
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const value = useContext(RoomContext);
  if (!value) throw new Error("useRoom must be used inside RoomProvider");
  return value;
}
