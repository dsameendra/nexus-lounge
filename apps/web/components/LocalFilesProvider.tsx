"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { AudioPresets, RoomEvent, Track } from "livekit-client";
import { expectedPosition, languageCode, streamKey, type Stream } from "@nexus/shared";
import { LocalEntry, registry, URL_OPEN_MS, type EntrySource } from "@/lib/local-entry";
import { canHostFeed, openRemembered, readFingerprint, recallFile, rememberFile, type PickedFile } from "@/lib/local-files";
import { blindTorrentSource, friendlyError, requireStremio, resolveLinkForStream, resolveTorrentForStream, type Resolved } from "@/lib/remote-media";
import { discoverSubtitles, readLanguagePref } from "@/lib/subtitles";
import { checkStremio, getStremioBase, getStremioStatus, torrentStats, type TorrentStats } from "@/lib/stremio";
import { useRoom } from "./RoomProvider";
import { StreamLinkSheet } from "./StreamLinkSheet";

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
  note: (streamId: string) => { busy: boolean; problem: string | null };
  setNote: (streamId: string, patch: Partial<{ busy: boolean; problem: string | null }>) => void;
  adoptSource: (streamId: string, resolved: Resolved, link?: string) => Promise<void>;
  playTorrent: (stream: Stream) => Promise<void>;
  playLink: (stream: Stream, url: string, step?: (message: string) => void) => Promise<Resolved>;
  stats: (streamId: string) => TorrentStats | null;
  openLinkSheet: (streamId: string) => void;
}

// A stream you chose to play yourself survives a refresh (this tab only): torrents by remembering the choice,
// links by keeping the address, which can hold a personal token, in session storage and nowhere else.
const FLAG = (streamId: string) => `nexus-device-${streamId}`;
type Flag = { kind: "torrent" } | { kind: "link"; url: string };
const readFlag = (streamId: string): Flag | null => {
  try {
    return JSON.parse(sessionStorage.getItem(FLAG(streamId)) ?? "null") as Flag | null;
  } catch {
    return null;
  }
};
const writeFlag = (streamId: string, flag: Flag | null) => {
  try {
    if (flag) sessionStorage.setItem(FLAG(streamId), JSON.stringify(flag));
    else sessionStorage.removeItem(FLAG(streamId));
  } catch {}
};

const Context = createContext<LocalFilesValue | null>(null);

export function useLocalFiles() {
  const value = useContext(Context);
  if (!value) throw new Error("useLocalFiles must be used inside LocalFilesProvider");
  return value;
}

export const NOT_THE_SAME_FILE = "That isn't the same file as the one in the room. Pick the exact same file (same size and content).";

export function LocalFilesProvider({ children }: { children: React.ReactNode }) {
  const lk = useRoomContext();
  const { state, self, send, status, clock } = useRoom();
  const entries = useRef(registry);
  const wanted = useRef<string | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((value) => value + 1), []);
  const [rememberedNames, setRememberedNames] = useState<Record<string, string>>({});
  const tried = useRef(new Set<string>());
  const [notes, setNotes] = useState<Record<string, { busy: boolean; problem: string | null }>>({});
  const [sharing, setSharing] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const canHost = useMemo(() => canHostFeed(), []);

  const latest = useRef({ state, self, send, clock, status });
  useEffect(() => {
    latest.current = { state, self, send, clock, status };
  });
  // Streams this tab has seen in the room: only those can be "gone".
  const seen = useRef(new Set<string>());

  const install = useCallback(
    async (streamId: string, source: EntrySource, picked?: PickedFile) => {
      const created = new LocalEntry(streamId, source);
      const { state: now, clock: roomClock } = latest.current;
      const playback = now.streams.find((item) => item.id === streamId)?.playback;
      const room = playback && roomClock.ready ? expectedPosition(playback, roomClock.now()) : null;
      const length = now.streams.find((item) => item.id === streamId)?.file?.duration;
      const at = room !== null && length && room >= length - 1 ? 0 : room;
      try {
        await created.start(at ?? 0);
        await created.opened(source.kind === "url" ? URL_OPEN_MS : 10_000);
      } catch (error) {
        created.destroy();
        throw error;
      }
      entries.current.get(streamId)?.destroy();
      created.createdAt = Date.now();
      if (!latest.current.state.streams.some((item) => item.id === streamId)) seen.current.delete(streamId);
      entries.current.set(streamId, created);
      setRememberedNames(({ [streamId]: _gone, ...rest }) => rest);
      if (picked) void rememberFile(streamId.slice("local:".length), picked.file, picked.handle);
      bump();
      if (source.kind === "url" && source.subs) {
        void discoverSubtitles(source.subs).then((found) => {
          created.addSubtitles(found);
          const saved = readLanguagePref();
          const pref = saved === "off" || (saved && saved !== "on" && /^[a-z]{2,3}$/.test(saved)) ? saved : null;
          const wanted = pref === "off" ? null : (pref ?? languageCode(navigator.language));
          const match = wanted ? found.find((option) => option.lang === wanted) : undefined;
          if (match && created.activeSubtitle === null && !created.subtitleBusy) void created.selectSubtitle(match.id);
        });
      }
    },
    [bump],
  );

  const attach = useCallback(
    async (stream: Stream, picked: PickedFile) => {
      const id = await readFingerprint(picked.file);
      if (streamKey({ type: "local", id, isLive: false }) !== stream.id) throw new Error(NOT_THE_SAME_FILE);
      await install(stream.id, { kind: "file", file: picked.file }, picked);
    },
    [install],
  );

  const adopt = useCallback((streamId: string, picked: PickedFile) => install(streamId, { kind: "file", file: picked.file }, picked), [install]);

  const adoptSource = useCallback(
    async (streamId: string, resolved: Resolved, link?: string) => {
      await install(streamId, resolved.source);
      writeFlag(streamId, link ? { kind: "link", url: link } : { kind: "torrent" });
    },
    [install],
  );

  const detach = useCallback(
    (streamId: string) => {
      entries.current.get(streamId)?.destroy();
      entries.current.delete(streamId);
      seen.current.delete(streamId);
      writeFlag(streamId, null);
      bump();
    },
    [bump],
  );

  // Play a torrent that is in the room through this person's own Stremio.
  const playTorrent = useCallback(
    async (stream: Stream) => {
      const status = getStremioStatus() === "connected" ? "connected" : await checkStremio();
      if (status === "insecure") {
        await install(stream.id, blindTorrentSource(getStremioBase(), stream));
        writeFlag(stream.id, { kind: "torrent" });
        return;
      }
      const base = await requireStremio();
      await adoptSource(stream.id, await resolveTorrentForStream(base, stream));
    },
    [install, adoptSource],
  );

  const playLink = useCallback(
    async (stream: Stream, url: string, step?: (message: string) => void) => {
      const status = getStremioStatus() === "connected" ? "connected" : await checkStremio();
      const resolved = await resolveLinkForStream(stream, url, status === "connected" ? getStremioBase() : null, step);
      await adoptSource(stream.id, resolved, url);
      return resolved;
    },
    [adoptSource],
  );

  const [linkSheet, setLinkSheet] = useState<string | null>(null);
  const [torrentStatsMap, setTorrentStats] = useState<Record<string, TorrentStats>>({});

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

  // Streams you were playing yourself before a refresh come back on their own.
  useEffect(() => {
    for (const stream of state.streams) {
      if ((stream.source.type !== "torrent" && stream.source.type !== "link") || entries.current.has(stream.id) || tried.current.has(stream.id)) continue;
      const flag = readFlag(stream.id);
      if (!flag) continue;
      tried.current.add(stream.id);
      void (flag.kind === "torrent" ? playTorrent(stream) : playLink(stream, flag.url)).catch((error) =>
        setNotes((previous) => ({ ...previous, [stream.id]: { busy: false, problem: friendlyError(error, "Couldn't reopen this stream.") } })),
      );
    }
  }, [state.streams, playTorrent, playLink]);

  // Download progress for torrents this person is playing through Stremio.
  useEffect(() => {
    const id = setInterval(() => {
      for (const [streamId, entry] of entries.current) {
        const torrent = entry.source.kind === "url" ? entry.source.torrent : undefined;
        if (!torrent) continue;
        void torrentStats(torrent.base, torrent.infoHash, torrent.fileIdx).then((value) => {
          if (value) setTorrentStats((previous) => ({ ...previous, [streamId]: value }));
        });
      }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Keep every open file on the room clock, and drop files whose stream is gone.
  useEffect(() => {
    const id = setInterval(() => {
      const { state, self, send, clock, status } = latest.current;
      for (const [streamId, entry] of entries.current) {
        const stream = state.streams.find((item) => item.id === streamId);
        if (stream) seen.current.add(streamId);
        if (!stream) {
          // A stream you just added is opened here before the room has heard of it, and the room's list is empty or stale while reconnecting: neither means it was removed.
          if (status !== "open" || (!seen.current.has(streamId) && Date.now() - entry.createdAt < 30_000)) continue;
          seen.current.delete(streamId);
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
      note: (streamId) => notes[streamId] ?? { busy: false, problem: null },
      adoptSource,
      playTorrent,
      playLink,
      stats: (streamId) => torrentStatsMap[streamId] ?? null,
      openLinkSheet: (streamId) => setLinkSheet(streamId),
      setNote: (streamId, patch) => setNotes((previous) => ({ ...previous, [streamId]: { busy: false, problem: null, ...previous[streamId], ...patch } })),
    }),
    [canHost, version, attach, adopt, detach, rememberedNames, resume, requestFeed, sharing, feedError, listen, notes, adoptSource, playTorrent, playLink, torrentStatsMap],
  );

  return (
    <Context.Provider value={value}>
      {children}
      {linkSheet && <StreamLinkSheet stream={state.streams.find((item) => item.id === linkSheet) ?? null} onClose={() => setLinkSheet(null)} />}
    </Context.Provider>
  );
}
