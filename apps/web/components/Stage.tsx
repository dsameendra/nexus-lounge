"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingReactions, ReactionBar, ReactionPicker, ReactionStrip } from "./Reactions";
import { ScreenBar } from "./ScreenBar";
import { isScreenId, screenIdentity } from "@nexus/shared";
import { Pill, ProviderBadge } from "./Badges";
import { BroadcastIcon, FilmIcon, PlusIcon, SyncIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { StreamPlayer } from "./StreamPlayer";
import { shareName, useEffectiveSource } from "./useEffectiveSource";
import { hasElementFullscreen } from "./useMediaQuery";
import { useStageFullscreen } from "./useStageFullscreen";
import { WatchArea } from "./WatchArea";

export function Stage({ onAdd }: { onAdd: () => void }) {
  const { state, self, select, send, isController, canAdd } = useRoom();
  const { effectiveId, stream, share, shares, featuredId, isFollowing } = useEffectiveSource();
  const boxRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const { active: fullscreen, immersive, toggle: toggleFullscreen } = useStageFullscreen(boxRef);

  const showingScreen = Boolean(share);

  function toggleStage() {
    if (share && !fullscreen && !hasElementFullscreen()) {
      const video = boxRef.current?.querySelector("video") as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      if (video?.webkitEnterFullscreen) {
        try {
          video.webkitEnterFullscreen();
          return;
        } catch {}
      }
    }
    toggleFullscreen();
  }
  const twitchLive = stream?.source.type === "twitch" && stream.source.isLive;
  const twitchActive = stream?.source.type === "twitch" && !showingScreen;
  const reactionsOn = state.room.settings.reactions;
  const featuredStream = state.streams.find((item) => item.id === featuredId);
  const roomIsElsewhere = !self.guest && !isFollowing && featuredId !== null;
  const featuredShare = featuredId && isScreenId(featuredId) ? shares.find((item) => item.participant.identity === screenIdentity(featuredId)) : undefined;
  const roomLabel = featuredShare ? `${shareName(featuredShare)}'s screen` : (featuredStream?.title ?? "something else");
  const heading = stream?.title ?? (share ? `${shareName(share)}'s screen` : null);

  return (
    <section aria-label="Now watching">
      <div
        ref={boxRef}
        className={
          immersive
            ? "fixed inset-0 z-[70] flex flex-col bg-black"
            : fullscreen
              ? "flex h-full w-full flex-col bg-black"
              : "bg-black lg:bg-transparent"
        }
      >
      <div
        className={`relative w-full overflow-hidden bg-black ${
          fullscreen
            ? "min-h-0 flex-1"
            : "aspect-video pl:aspect-auto pl:h-[calc(var(--app-height,100dvh)-2.75rem-env(safe-area-inset-top))] lg:rounded-2xl"
        }`}
      >
        <StreamPlayer
          stream={stream}
          visible={Boolean(stream) && !showingScreen}
          onFullscreen={toggleStage}
          fullscreen={fullscreen}
          controlsSlot={slot}
        />

        {reactionsOn && !twitchActive && effectiveId && <FloatingReactions />}

        {share && (
          <div className="absolute inset-0 z-10" onDoubleClick={toggleStage}>
            <WatchArea share={share} />
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
      <div ref={setSlot} className={immersive ? "pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]" : undefined} />
      {reactionsOn && twitchActive && <ReactionStrip />}
      {share && slot && createPortal(<ScreenBar share={share} container={boxRef.current} onFullscreen={toggleStage} />, slot)}
      </div>

      <div className="space-y-3 px-4 pt-3 lg:px-0">
        {(stream || share) && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {stream && <ProviderBadge source={stream.source} />}
                {share && <Pill tone="live">Live</Pill>}
                {featuredId === effectiveId && <Pill tone="accent">On air</Pill>}
              </div>
              <h1 className="line-clamp-1 text-base leading-snug font-semibold sm:line-clamp-2 sm:text-lg">{heading}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {effectiveId && reactionsOn && (
                <div className="lg:hidden">
                  <ReactionPicker />
                </div>
              )}
              {isController && effectiveId && featuredId !== effectiveId && (
              <button
                onClick={() => send({ type: "stream.feature", streamId: effectiveId })}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-medium transition hover:bg-white/15 active:scale-95"
              >
                <BroadcastIcon /> Show to everyone
              </button>
            )}
            </div>
          </div>
        )}

        {effectiveId && reactionsOn && (
          <div className="hidden lg:block">
            <ReactionBar />
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
          <p className="rounded-2xl bg-warn/12 px-4 py-3 text-sm leading-relaxed text-warn max-sm:py-2 max-sm:text-xs">
            Twitch live streams can't be time-synced, so everyone sees them at their own delay.<span className="max-sm:hidden"> For a frame-accurate shared view, have one person share this tab with <span className="font-semibold">Share screen</span>.</span>
          </p>
        )}
      </div>
    </section>
  );
}
