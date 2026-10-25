"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { AudioPresets, RoomEvent, Track } from "livekit-client";
import { streamKey, type Stream } from "@nexus/shared";
import { LocalEntry, registry } from "@/lib/local-entry";
import { canHostFeed, openRemembered, readFingerprint, recallFile, rememberFile, type PickedFile } from "@/lib/local-files";
import { useRoom } from "./RoomProvider";

export const FEED_VIDEO = (streamId: string) => `file:v:${streamId}`;
export const FEED_AUDIO = (streamId: string) => `file:a:${streamId}`;

const IDLE_BEFORE_STOP_MS = 10_000;

interface LocalFilesValue {
  canHost: boolean;
  version: number;
  entry: (streamId: string) => LocalEntry | undefined;
  attach: (stream: Stream, picked: PickedFile) => Promise<void>;
  adopt: (streamId: string, picked: PickedFile) => Promise<void>;
  detach: (streamId: string) => void;
  remembered: (streamId: string) => string | null;
  resume: (stream: Stream) => Promise<string | null>;
  requestFeed: (streamId: string | null) => void;
  sharing: string | null;
  feedError: string | null;
  listen: (streamId: string, gain: number) => void;
}

const Context = createContext<LocalFilesValue | null>(null);

export function useLocalFiles() {
  const value = useContext(Context);
  if (!value) throw new Error("useLocalFiles must be used inside LocalFilesProvider");
  return value;
}

export const NOT_THE_SAME_FILE = "That isn't the same file as the one in the room. Pick the exact same file (same size and content).";

function ready(entry: LocalEntry) {
  return new Promise<void>((resolve, reject) => {
    const { video } = entry;
    if (video.readyState >= 1) return resolve();
    const fail = () => reject(new Error(entry.error ?? "This file couldn't be opened."));
    const timer = setTimeout(fail, 10_000);
    video.addEventListener(
      "loadedmetadata",
      () => {
        clearTimeout(timer);
        if (video.videoWidth === 0) {
          entry.error = "This browser can play this file's sound but not its picture. MP4 (H.264/AAC) and WebM work everywhere.";
          return fail();
        }
        resolve();
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        fail();
      },
      { once: true },
    );
  });
}

export function LocalFilesProvider({ children }: { children: React.ReactNode }) {
  const lk = useRoomContext();
  const { state, self, send, status, clock } = useRoom();
  const entries = useRef(registry);
  const wanted = useRef<string | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((value) => value + 1), []);
  const [rememberedNames, setRememberedNames] = useState<Record<string, string>>({});
  const tried = useRef(new Set<string>());
  const [sharing, setSharing] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const canHost = useMemo(() => canHostFeed(), []);

  const latest = useRef({ state, self, send, clock });
  useEffect(() => {
    latest.current = { state, self, send, clock };
  });

  const install = useCallback(
    async (streamId: string, picked: PickedFile) => {
      const created = new LocalEntry(streamId, picked.file);
      try {
        await ready(created);
      } catch (error) {
        created.destroy();
        throw error;
      }
      entries.current.get(streamId)?.destroy();
      entries.current.set(streamId, created);
      setRememberedNames(({ [streamId]: _gone, ...rest }) => rest);
      void rememberFile(streamId.slice("local:".length), picked.file, picked.handle);
      bump();
    },
    [bump],
  );

  const attach = useCallback(
    async (stream: Stream, picked: PickedFile) => {
      const id = await readFingerprint(picked.file);
      if (streamKey({ type: "local", id, isLive: false }) !== stream.id) throw new Error(NOT_THE_SAME_FILE);
      await install(stream.id, picked);
    },
    [install],
  );

  const adopt = useCallback((streamId: string, picked: PickedFile) => install(streamId, picked), [install]);

  const detach = useCallback(
    (streamId: string) => {
      entries.current.get(streamId)?.destroy();
      entries.current.delete(streamId);
      bump();
    },
    [bump],
  );

  const resume = useCallback(
    async (stream: Stream) => {
      const saved = await recallFile(stream.source.id);
      const file = saved && (await openRemembered(saved, true));
      if (!saved || !file) return "Couldn't open the remembered file. Pick it again.";
      try {
        await attach(stream, { file, handle: saved.handle });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't open the remembered file.";
      }
    },
    [attach],
  );

  // Reopen remembered files quietly when the browser still allows it; otherwise offer a one-tap resume.
  useEffect(() => {
    for (const stream of state.streams) {
      if (stream.source.type !== "local" || entries.current.has(stream.id) || tried.current.has(stream.id)) continue;
      tried.current.add(stream.id);
      void (async () => {
        const saved = await recallFile(stream.source.id);
        if (!saved) return;
        const file = await openRemembered(saved, false);
        if (file) {
          try {
            await attach(stream, { file, handle: saved.handle });
            return;
          } catch {}
        }
        setRememberedNames((names) => ({ ...names, [stream.id]: saved.name }));
      })();
    }
  }, [state.streams, attach]);

  // Keep every open file on the room clock, and drop files whose stream is gone.
  useEffect(() => {
    const id = setInterval(() => {
      const { state, self, send, clock } = latest.current;
      for (const [streamId, entry] of entries.current) {
        const stream = state.streams.find((item) => item.id === streamId);
        if (!stream) {
          entry.destroy();
          entries.current.delete(streamId);
          setVersion((value) => value + 1);
          continue;
        }
        if (!clock.ready) continue;
        const owner = stream.addedBy.id === self.id;
        entry.tick(stream.playback, clock.now(), owner ? (position) => send({ type: "stream.establish", streamId, position }) : null);
      }
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Some browsers (Safari) keep audio suspended until a tap; the first tap or key press anywhere wakes every open file.
  useEffect(() => {
    const wake = () => {
      for (const entry of registry.values()) if (!entry.audioRunning) void entry.resumeAudio();
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  const listen = useCallback((streamId: string, gain: number) => {
    entries.current.get(streamId)?.setSpeakerGain(gain);
  }, []);

  // Viewers: only receive the owner's feed while this device is actually watching it.
  const applySubscriptions = useCallback(() => {
    const { state } = latest.current;
    for (const participant of lk.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const name = publication.trackName;
        if (!name.startsWith("file:")) continue;
        const target = wanted.current;
        const owner = target ? state.streams.find((item) => item.id === target)?.addedBy.id : null;
        const want = target !== null && participant.identity === owner && (name === FEED_VIDEO(target) || name === FEED_AUDIO(target));
        if (publication.isDesired !== want) publication.setSubscribed(want);
      }
    }
  }, [lk]);

  useEffect(() => {
    const events = [RoomEvent.TrackPublished, RoomEvent.ParticipantConnected] as const;
    for (const event of events) lk.on(event, applySubscriptions);
    applySubscriptions();
    return () => {
      for (const event of events) lk.off(event, applySubscriptions);
    };
  }, [lk, applySubscriptions]);

  const requestFeed = useCallback(
    (streamId: string | null) => {
      wanted.current = streamId;
      latest.current.send({ type: "presence.feed", streamId });
      applySubscriptions();
    },
    [applySubscriptions],
  );

  useEffect(() => {
    if (status === "open" && wanted.current) send({ type: "presence.feed", streamId: wanted.current });
  }, [status, send]);

  // Owner: publish the live feed only while someone is watching it.
  const feed = useRef<{ streamId: string; stopVideo: () => void; videoTrack: MediaStreamTrack; audioTrack: MediaStreamTrack | null } | null>(null);
  const starting = useRef(false);
  const idleSince = useRef(0);

  const stopFeed = useCallback(async () => {
    const current = feed.current;
    if (!current) return;
    feed.current = null;
    setSharing(null);
    try {
      await lk.localParticipant.unpublishTrack(current.videoTrack, true);
      if (current.audioTrack) await lk.localParticipant.unpublishTrack(current.audioTrack, false);
    } catch {}
    current.stopVideo();
  }, [lk]);

  useEffect(() => {
    const startFeed = async (entry: LocalEntry) => {
      starting.current = true;
      try {
        await entry.resumeAudio();
        if (!entry.audioRunning) setFeedError("Click anywhere on the page to start the sound of the live feed.");
        const video = entry.captureVideo();
        const audioTrack = entry.feedAudioTrack();
        try {
          await lk.localParticipant.publishTrack(video.track, {
            source: Track.Source.Unknown,
            name: FEED_VIDEO(entry.streamId),
            videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 },
            simulcast: true,
            degradationPreference: "maintain-resolution",
          });
          if (audioTrack) {
            await lk.localParticipant.publishTrack(audioTrack, {
              source: Track.Source.Unknown,
              name: FEED_AUDIO(entry.streamId),
              audioPreset: AudioPresets.musicHighQualityStereo,
              dtx: false,
              red: false,
              forceStereo: true,
            });
          }
        } catch (error) {
          video.stop();
          throw error;
        }
        feed.current = { streamId: entry.streamId, stopVideo: video.stop, videoTrack: video.track, audioTrack };
        idleSince.current = 0;
        if (entry.audioRunning) setFeedError(null);
        setSharing(entry.streamId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        setFeedError(/permission/i.test(message) ? "You can't share video in this room right now." : "Couldn't start the live feed from this browser.");
      } finally {
        starting.current = false;
      }
    };

    const id = setInterval(() => {
      const { state, self } = latest.current;
      const demand = (streamId: string) => state.members.some((member) => member.feed === streamId);
      const current = feed.current;
      if (current) {
        const alive = entries.current.has(current.streamId) && state.streams.some((item) => item.id === current.streamId);
        if (!alive) return void stopFeed();
        if (entries.current.get(current.streamId)?.audioRunning) setFeedError((message) => (message?.startsWith("Click anywhere") ? null : message));
        if (demand(current.streamId)) idleSince.current = 0;
        else if (idleSince.current === 0) idleSince.current = Date.now();
        else if (Date.now() - idleSince.current > IDLE_BEFORE_STOP_MS) void stopFeed();
        return;
      }
      if (starting.current) return;
      for (const [streamId, entry] of entries.current) {
        const stream = state.streams.find((item) => item.id === streamId);
        if (stream?.addedBy.id === self.id && demand(streamId)) {
          void startFeed(entry);
          return;
        }
      }
    }, 1000);
    return () => {
      clearInterval(id);
      void stopFeed();
    };
  }, [lk, stopFeed]);

  const value = useMemo<LocalFilesValue>(
    () => ({
      canHost,
      version,
      entry: (streamId) => entries.current.get(streamId),
      attach,
      adopt,
      detach,
      remembered: (streamId) => rememberedNames[streamId] ?? null,
      resume,
      requestFeed,
      sharing,
      feedError,
      listen,
    }),
    [canHost, version, attach, adopt, detach, rememberedNames, resume, requestFeed, sharing, feedError, listen],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
