"use client";

import { useRef } from "react";
import { SCREEN_ID } from "@nexus/shared";
import { Pill, ProviderBadge } from "./Badges";
import { BroadcastIcon, FilmIcon, FullscreenIcon, PlusIcon, SyncIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { StreamPlayer } from "./StreamPlayer";
import { useEffectiveSource } from "./useEffectiveSource";
import { WatchArea } from "./WatchArea";

export function Stage({ onAdd }: { onAdd: () => void }) {
  const { state, self, select, send, isController, canAdd } = useRoom();
  const { effectiveId, stream, screenActive, featuredId, isFollowing } = useEffectiveSource();
  const boxRef = useRef<HTMLDivElement>(null);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boxRef.current?.requestFullscreen?.();
  }

  const showingScreen = effectiveId === SCREEN_ID;
  const twitchLive = stream?.source.type === "twitch" && stream.source.isLive;
  const featuredStream = state.streams.find((item) => item.id === featuredId);
  const roomIsElsewhere = !self.guest && !isFollowing && featuredId !== null;
  const roomLabel = featuredId === SCREEN_ID ? "the screen share" : (featuredStream?.title ?? "something else");

  return (
    <section aria-label="Now watching">
      <div ref={boxRef} className="relative aspect-video w-full overflow-hidden bg-black lg:rounded-2xl">
        <StreamPlayer stream={stream} visible={Boolean(stream) && !showingScreen} onFullscreen={toggleFullscreen} />

        {showingScreen && (
          <div className="absolute inset-0 z-10">
            <WatchArea />
            <button
              onClick={toggleFullscreen}
              aria-label="Fullscreen"
              className="material absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full text-xl transition hover:brightness-125 active:scale-95"
            >
              <FullscreenIcon />
            </button>
          </div>
        )}

        {!effectiveId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-panel text-2xl text-label-2">
              <FilmIcon />
            </span>
            <div>
              <p className="font-semibold">{self.guest ? "Waiting for the host" : "Nothing playing yet"}</p>
              <p className="mt-1 text-sm text-label-2">
                {self.guest ? "The host will pick something to watch." : "Add a YouTube or Twitch link, or share your screen."}
              </p>
            </div>
            {canAdd && (
              <button
                onClick={onAdd}
                className="flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold transition hover:brightness-110 active:scale-95"
              >
                <PlusIcon /> Add a stream
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 pt-3 lg:px-0">
        {(stream || showingScreen) && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {stream && <ProviderBadge source={stream.source} />}
                {(stream ? featuredId === stream.id : featuredId === SCREEN_ID || (screenActive && !featuredId)) && <Pill tone="accent">On air</Pill>}
              </div>
              <h1 className="line-clamp-2 text-base leading-snug font-semibold sm:text-lg">{stream?.title ?? "Screen share"}</h1>
            </div>
            {isController && featuredId !== (stream?.id ?? SCREEN_ID) && (
              <button
                onClick={() => send({ type: "stream.feature", streamId: stream?.id ?? SCREEN_ID })}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-medium transition hover:bg-white/15 active:scale-95"
              >
                <BroadcastIcon /> Show to everyone
              </button>
            )}
          </div>
        )}

        {roomIsElsewhere && (
          <div className="animate-fade flex items-center justify-between gap-3 rounded-2xl bg-accent/15 px-4 py-3">
            <p className="min-w-0 truncate text-sm">
              The room is watching <span className="font-medium">{roomLabel}</span>
            </p>
            <button
              onClick={() => select(null)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-sm font-semibold transition hover:brightness-110 active:scale-95"
            >
              <SyncIcon /> Join them
            </button>
          </div>
        )}

        {twitchLive && (
          <p className="rounded-2xl bg-warn/12 px-4 py-3 text-sm leading-relaxed text-warn">
            Twitch live streams can't be time-synced, so everyone sees them at their own delay. For a frame-accurate shared view, have one person share
            this tab with <span className="font-semibold">Share screen</span>.
          </p>
        )}
      </div>
    </section>
  );
}
