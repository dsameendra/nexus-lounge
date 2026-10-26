"use client";

import { useMemo, useState } from "react";
import { cleanFileName, parseMediaUrl, parsePlaylistId, streamKey } from "@nexus/shared";
import { fileFromDrop, formatBytes, formatLength, pickFile, probeFile, readFingerprint, type PickedFile } from "@/lib/local-files";
import { CheckIcon, FilmIcon, LinkIcon, PlaylistIcon } from "./Icons";
import { AddStremioPanel } from "./AddStremioPanel";
import { useLocalFiles } from "./LocalFilesProvider";
import { useRoom } from "./RoomProvider";
import { Segmented } from "./Segmented";
import { Sheet } from "./Sheet";

function FilePanel({ onClose }: { onClose: () => void }) {
  const { send, isController, select } = useRoom();
  const files = useLocalFiles();
  const [picked, setPicked] = useState<{ file: PickedFile; id: string; duration: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: PickedFile | null) {
    if (!next) return;
    setBusy(true);
    setError(null);
    setPicked(null);
    try {
      const { duration } = await probeFile(next.file);
      setPicked({ file: next, id: await readFingerprint(next.file), duration });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "This file couldn't be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function add(mode: "library" | "everyone" | "me") {
    if (!picked) return;
    const source = { type: "local" as const, id: picked.id, isLive: false };
    const id = streamKey(source);
    setBusy(true);
    try {
      await files.adopt(id, picked.file);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "This file couldn't be opened.");
      setBusy(false);
      return;
    }
    send({ type: "stream.add", source, file: { name: cleanFileName(picked.file.file.name), size: picked.file.file.size, duration: picked.duration } });
    if (mode === "everyone") {
      send({ type: "stream.feature", streamId: id });
      send({ type: "stream.control", streamId: id, action: "play", position: null });
    }
    if (mode === "me") select(id);
    onClose();
  }

  const primary = isController ? "everyone" : "me";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void pickFile().then(choose)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void fileFromDrop(event).then(choose);
        }}
        className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/20 bg-panel-2 px-4 py-6 text-center transition hover:bg-panel-3"
      >
        <FilmIcon className="text-2xl text-label-2" />
        <span className="text-base font-medium">{picked ? picked.file.file.name : busy ? "Checking the file…" : "Choose a video file"}</span>
        <span className="text-sm text-label-2">
          {picked ? `${formatBytes(picked.file.file.size)} · ${formatLength(picked.duration)}` : "or drop it here. MP4 (H.264/AAC) and WebM work everywhere."}
        </span>
      </button>

      <div className="min-h-6 space-y-2 text-sm">
        {error && <p className="text-danger">{error}</p>}
        {picked && (
          <p className="flex items-center gap-2 text-live">
            <CheckIcon /> Ready
          </p>
        )}
        <p className="text-label-2">
          The video isn&apos;t uploaded. Everyone in the room will see the file name. Friends watch a live feed from your browser, or play their own copy of the same file.
        </p>
        {!files.canHost && <p className="text-warn">This browser can&apos;t send a live feed, so only people who have the same file can watch.</p>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          disabled={!picked || busy}
          onClick={() => void add(primary)}
          className="h-12 flex-1 rounded-xl bg-accent px-4 font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
        >
          {isController ? "Play for everyone" : "Add and watch"}
        </button>
        <button
          type="button"
          disabled={!picked || busy}
          onClick={() => void add("library")}
          className="h-12 flex-1 rounded-xl bg-panel-2 px-4 font-semibold transition hover:bg-panel-3 active:scale-[0.99] disabled:opacity-40"
        >
          Add to library
        </button>
      </div>
    </div>
  );
}

export function AddStreamSheet({ onClose }: { onClose: () => void }) {
  const { send, isController, select, self, state } = useRoom();
  const [tab, setTab] = useState<"link" | "file" | "stremio">("link");
  const canFile = !self.guest && (state.room.settings.sharing === "everyone" || isController);
  const canStremio = !self.guest && isController;
  const tabs = canFile || canStremio;
  const [value, setValue] = useState("");
  const result = useMemo(() => (value.trim() ? parseMediaUrl(value) : null), [value]);
  const source = result?.ok ? result.source : null;
  const listId = useMemo(() => parsePlaylistId(value), [value]);

  function add(mode: "library" | "everyone" | "me") {
    if (!source) return;
    const id = streamKey(source);
    send({ type: "stream.add", source });
    if (mode === "everyone") {
      send({ type: "stream.feature", streamId: id });
      send({ type: "stream.control", streamId: id, action: "play", position: null });
    }
    if (mode === "me") select(id);
    onClose();
  }

  function addPlaylist() {
    if (!listId) return;
    send({ type: "playlist.add", listId });
    onClose();
  }

  const primary = isController ? "everyone" : "me";
  const label = source ? (source.type === "youtube" ? (source.isLive ? "YouTube live" : "YouTube video") : source.type === "kick" ? `Kick channel · ${source.id}` : source.isLive ? `Twitch channel · ${source.id}` : "Twitch broadcast") : null;

  return (
    <Sheet title="Add a stream" onClose={onClose}>
      {tabs && (
        <Segmented
          className="mb-4"
          value={tab}
          onChange={setTab}
          options={[
            { value: "link", label: "Link", icon: <LinkIcon /> },
            ...(canFile ? [{ value: "file" as const, label: "Video file", icon: <FilmIcon /> }] : []),
            ...(canStremio ? [{ value: "stremio" as const, label: "Stremio / link", icon: <PlaylistIcon /> }] : []),
          ]}
        />
      )}
      {tab === "file" && canFile && <FilePanel onClose={onClose} />}
      {tab === "stremio" && canStremio && <AddStremioPanel onClose={onClose} />}
      <form
        hidden={tab !== "link" && tabs}
        onSubmit={(event) => {
          event.preventDefault();
          if (listId && !source) addPlaylist();
          else add(primary);
        }}
        className="space-y-4"
      >
        <label className="flex items-center gap-3 rounded-xl bg-panel-2 px-4 py-3 focus-within:ring-2 focus-within:ring-accent">
          <LinkIcon className="shrink-0 text-lg text-label-2" />
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a YouTube, Twitch or Kick link"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-label-3"
          />
        </label>

        <div className="min-h-6 text-sm">
          {result && !result.ok && !listId && <p className="text-danger">{result.reason}</p>}
          {listId && (
            <p className="flex items-center gap-2 text-live">
              <PlaylistIcon /> YouTube playlist{source ? " (this link also has a single video)" : ""}
            </p>
          )}
          {label && !listId && (
            <p className="flex items-center gap-2 text-live">
              <CheckIcon /> {label}
            </p>
          )}
          {!result && <p className="text-label-2">Videos, playlists, past broadcasts, live streams and channels all work.</p>}
        </div>

        {listId && (
          <button
            type="button"
            onClick={addPlaylist}
            className="h-12 w-full rounded-xl bg-accent px-4 font-semibold transition hover:brightness-110 active:scale-[0.99]"
          >
            Add playlist
          </button>
        )}

        <div className={`flex flex-col gap-2 sm:flex-row-reverse ${listId && !source ? "hidden" : ""}`}>
          <button
            type="submit"
            disabled={!source}
            className="h-12 flex-1 rounded-xl bg-accent px-4 font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
          >
            {isController ? "Play for everyone" : "Add and watch"}
          </button>
          <button
            type="button"
            disabled={!source}
            onClick={() => add("library")}
            className="h-12 flex-1 rounded-xl bg-panel-2 px-4 font-semibold transition hover:bg-panel-3 active:scale-[0.99] disabled:opacity-40"
          >
            Add to library
          </button>
        </div>
      </form>
    </Sheet>
  );
}
