"use client";

import { useEffect, useRef, useState } from "react";
import { screenId } from "@nexus/shared";
import { BroadcastIcon, ScreenIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { shareName, useScreenShares } from "./useEffectiveSource";

interface Notice {
  id: string;
  name: string;
}

const SETTLE_MS = 3000;
const VISIBLE_MS = 9000;

export function ShareNotices() {
  const { select, send, self, isController } = useRoom();
  const shares = useScreenShares();
  const [notices, setNotices] = useState<Notice[]>([]);
  const known = useRef(new Set<string>());
  const mountedAt = useRef(Date.now());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const key = shares.map((share) => `${share.participant.identity}${share.participant.isLocal ? "*" : ""}`).join("|");

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    const settling = Date.now() - mountedAt.current < SETTLE_MS;
    for (const share of shares) {
      const id = screenId(share.participant.identity);
      if (known.current.has(id)) continue;
      known.current.add(id);
      if (settling || share.participant.isLocal) continue;
      setNotices((previous) => [...previous, { id, name: shareName(share) }]);
      const timer = setTimeout(() => {
        setNotices((previous) => previous.filter((notice) => notice.id !== id));
        timers.current.delete(timer);
      }, VISIBLE_MS);
      timers.current.add(timer);
    }
    const current = new Set(shares.map((share) => screenId(share.participant.identity)));
    for (const id of known.current) if (!current.has(id)) known.current.delete(id);
    setNotices((previous) => (previous.some((notice) => !current.has(notice.id)) ? previous.filter((notice) => current.has(notice.id)) : previous));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const dismiss = (id: string) => setNotices((previous) => previous.filter((notice) => notice.id !== id));
  if (notices.length === 0) return null;

  return (
    <div role="status" className="fixed left-1/2 z-40 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)]">
      {notices.map((notice) => (
        <div key={notice.id} className="material animate-sheet flex items-center gap-3 rounded-2xl border border-line p-3 shadow-2xl">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/25 text-lg text-accent">
            <ScreenIcon />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{notice.name}</span> started sharing their screen
          </p>
          {!self.guest && (
            <button
              onClick={() => {
                select(notice.id);
                dismiss(notice.id);
              }}
              className="h-8 shrink-0 rounded-full bg-accent px-3.5 text-sm font-semibold transition hover:brightness-110 active:scale-95"
            >
              Watch
            </button>
          )}
          {isController && (
            <button
              onClick={() => {
                send({ type: "stream.feature", streamId: notice.id });
                dismiss(notice.id);
              }}
              aria-label="Show to everyone"
              title="Show to everyone"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-base transition hover:bg-white/15 active:scale-95"
            >
              <BroadcastIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
