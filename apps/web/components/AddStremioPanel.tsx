"use client";

import { useMemo, useState } from "react";
import { cleanFileName, parseStremioInput, torrentStreamId, type StremioInput } from "@nexus/shared";
import { friendlyError, openTorrent, requireStremio, resolveLink, resolveTorrentFile, type Resolved, type TorrentChoice } from "@/lib/remote-media";
import { checkStremio, getStremioBase, getStremioStatus } from "@/lib/stremio";
import { formatBytes, formatLength } from "@/lib/local-files";
import { CheckIcon, FilmIcon, LinkIcon } from "./Icons";
import { useLocalFiles } from "./LocalFilesProvider";
import { useRoom } from "./RoomProvider";
import { StremioConnection } from "./StremioConnection";

type Ready = {
  resolved: Resolved;
  input: Exclude<StremioInput, { kind: "error" }>;
  fileIdx: number | null;
  link: string | null;
};

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");

export function AddStremioPanel({ onClose }: { onClose: () => void }) {
  const { send, select } = useRoom();
  const files = useLocalFiles();
  const [value, setValue] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [choice, setChoice] = useState<TorrentChoice | null>(null);
  const [title, setTitle] = useState("");
  const busy = step !== null;
  const parsed = useMemo(() => (value.trim() ? parseStremioInput(value) : null), [value]);

  function reset() {
    setReady(null);
    setChoice(null);
    setError(null);
  }

  async function pickFile(input: Extract<StremioInput, { kind: "torrent" }>, torrent: TorrentChoice, index: number) {
    const base = await requireStremio();
    const resolved = await resolveTorrentFile(base, input.infoHash, torrent, index, setStep);
    setTitle(input.name ?? resolved.name);
    setReady({ resolved, input, fileIdx: index, link: null });
  }

  async function check() {
    if (busy) return;
    reset();
    const input = parseStremioInput(value);
    if (input.kind === "error") return setError(input.reason);
    setStep("Starting…");
    try {
      if (input.kind === "torrent") {
        const base = await requireStremio();
        const torrent = await openTorrent(base, input.infoHash, input.trackers, setStep);
        setChoice(torrent);
        const index = torrent.videos.some((video) => video.index === input.fileIdx) ? input.fileIdx! : torrent.videos[0]!.index;
        await pickFile(input, torrent, index);
      } else {
        const status = getStremioStatus() === "connected" ? "connected" : await checkStremio();
        const resolved = await resolveLink(input.url, status === "connected" ? getStremioBase() : null, setStep);
        setTitle(resolved.name);
        setReady({ resolved, input, fileIdx: null, link: input.url });
      }
    } catch (problem) {
      setError(friendlyError(problem, "Couldn't check that. Try again."));
    } finally {
      setStep(null);
    }
  }

  async function changeFile(index: number) {
    if (!ready || !choice || ready.input.kind !== "torrent" || busy) return;
    setStep("Reading the video…");
    setError(null);
    try {
      await pickFile(ready.input, choice, index);
    } catch (problem) {
      setError(friendlyError(problem, "Couldn't read that file."));
    } finally {
      setStep(null);
    }
  }

  async function add(mode: "library" | "everyone" | "me") {
    if (!ready || busy) return;
    const { resolved, input } = ready;
    const name = cleanFileName(title || resolved.name);
    const torrent = input.kind === "torrent";
    const source = torrent
      ? { type: "torrent" as const, id: torrentStreamId(input.infoHash, ready.fileIdx!), isLive: false }
      : { type: "link" as const, id: randomId(), isLive: false };
    const id = `${source.type}:${source.id}`;
    setStep("Opening it here…");
    try {
      await files.adoptSource(id, resolved, ready.link ?? undefined);
    } catch (problem) {
      setStep(null);
      return setError(problem instanceof Error ? problem.message : "Couldn't open it.");
    }
    send({ type: "stream.add", source, file: { name, size: resolved.size, duration: resolved.duration }, ...(torrent && input.trackers.length ? { trackers: input.trackers } : {}) });
    if (mode === "everyone") {
      send({ type: "stream.feature", streamId: id });
      send({ type: "stream.control", streamId: id, action: "play", position: null });
    }
    if (mode === "me") select(id);
    onClose();
  }

  const kindLabel = parsed?.kind === "torrent" ? "Torrent" : parsed?.kind === "link" ? "Video link" : null;

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
        className="space-y-2"
      >
        <div className="flex items-center gap-2 rounded-xl bg-panel-2 py-1.5 pr-1.5 pl-4 focus-within:ring-2 focus-within:ring-accent">
          <LinkIcon className="shrink-0 text-lg text-label-2" />
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (ready || error) reset();
            }}
            placeholder="Paste a magnet, Stremio stream link or video link"
            aria-label="Magnet, Stremio stream link or video link"
            aria-invalid={Boolean(error)}
            disabled={busy}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-label-3"
          />
          <button
            type="submit"
            disabled={busy || !value.trim() || parsed?.kind === "error"}
            className="h-9 shrink-0 rounded-lg bg-white/10 px-4 text-sm font-semibold transition hover:bg-white/15 active:scale-95 disabled:opacity-40"
          >
            {busy ? "Checking…" : ready ? "Check again" : "Check"}
          </button>
        </div>
        {!ready && !step && !error && (
          <p className="text-sm leading-snug text-label-2">
            {parsed?.kind === "torrent"
              ? "A torrent. It opens in your Stremio."
              : parsed?.kind === "link"
                ? "A video link."
                : parsed?.kind === "error" && value.trim().length > 12
                  ? ""
                  : "Magnets and Stremio stream links open in your Stremio. Video links can come from any service."}
          </p>
        )}
      </form>

      <div className="space-y-2 text-sm empty:hidden" aria-live="polite">
        {step && (
          <p className="flex items-center gap-2 text-label-2">
            <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white" /> {step}
          </p>
        )}
        {parsed?.kind === "error" && !step && !error && value.trim().length > 12 && <p className="text-danger">{parsed.reason}</p>}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>

      {ready && (
        <div className="space-y-3 rounded-xl bg-panel-2 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xl text-label-2">
              <FilmIcon />
            </span>
            <div className="min-w-0 flex-1">
              <label className="block text-xs text-label-2" htmlFor="stremio-title">
                Name everyone will see
              </label>
              <input
                id="stremio-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                className="mt-1 h-10 w-full rounded-lg bg-panel px-3 text-base outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="mt-1.5 text-xs text-label-2">
                {ready.resolved.size > 0 ? `${formatBytes(ready.resolved.size)} · ` : ""}
                {formatLength(ready.resolved.duration)}
              </p>
            </div>
          </div>

          {choice && choice.videos.length > 1 && (
            <div>
              <label className="block text-xs text-label-2" htmlFor="stremio-file">
                Which video in the torrent
              </label>
              <select
                id="stremio-file"
                value={ready.fileIdx ?? undefined}
                disabled={busy}
                onChange={(event) => void changeFile(Number(event.target.value))}
                className="mt-1 h-10 w-full rounded-lg bg-panel px-3 text-base outline-none focus:ring-2 focus:ring-accent"
              >
                {choice.videos.map((video) => (
                  <option key={video.index} value={video.index}>
                    {video.name} · {formatBytes(video.length)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="flex items-start gap-2 text-sm text-live">
            <CheckIcon className="mt-0.5 shrink-0" />
            <span>{ready.resolved.how === "direct" ? "Ready. It plays straight in your browser." : "Ready. It plays through your Stremio, converted so every browser can play it."}</span>
          </p>
          {ready.resolved.warning && (
            <p role="alert" className="text-sm text-warn">
              {ready.resolved.warning}
            </p>
          )}
        </div>
      )}

      <StremioConnection />

      <p className="text-sm leading-relaxed text-label-2">
        {ready?.input.kind === "link"
          ? "Your link stays in this tab: the room and our server never see it. Friends watch a live feed from your browser, or paste their own link to the same video."
          : "Friends watch a live feed from your browser. Friends with Stremio can play the torrent themselves, in sync, with no load on you."}{" "}
        Only share what you have the right to.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void add("everyone")}
          className="h-12 flex-1 rounded-xl bg-accent px-4 font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
        >
          Play for everyone
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void add("library")}
          className="h-12 flex-1 rounded-xl bg-panel-2 px-4 font-semibold transition hover:bg-panel-3 active:scale-[0.99] disabled:opacity-40"
        >
          Add to library
        </button>
      </div>
    </div>
  );
}
