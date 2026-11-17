"use client";

import { useEffect } from "react";
import { loadRecent, saveRecent, withDetails, withVisit } from "@/lib/recent-rooms";

// Called from the room header, so only once the room's state has arrived, and never from the TV view.
export function useRecentVisit(userId: string, roomId: string, name: string, startsAt: number | null) {
  useEffect(() => {
    saveRecent(userId, withVisit(loadRecent(userId), { id: roomId, name, startsAt }));
    // Only the first state counts as a visit; later changes update the entry below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, roomId]);

  useEffect(() => {
    saveRecent(userId, withDetails(loadRecent(userId), roomId, { name, startsAt }));
  }, [userId, roomId, name, startsAt]);
}
