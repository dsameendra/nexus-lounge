"use client";

import { useState } from "react";
import { parseStremioInput, sameMedia, type Stream } from "@nexus/shared";
import { friendlyError, openTorrent, requireStremio, resolveTorrentFile } from "@/lib/remote-media";
import { LinkIcon } from "./Icons";
import { useLocalFiles } from "./LocalFilesProvider";
import { Sheet } from "./Sheet";
import { StremioConnection } from "./StremioConnection";
import { useRoom } from "./RoomProvider";

// Paste your own link (or magnet) to the same video. It stays in this tab and is never sent to the room.
export function StreamLinkSheet({ stream, onClose }: { stream: Stream | null; onClose: () => void }) {
  const files = useLocalFiles();
  const { self } = useRoom();
  const [value, setValue] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  if (!stream) return null;
  const owner = stream.addedBy.id === self.id;
  const busy = step !== null;

  async function submit() {
    if (!stream || busy) return;
    setError(null);
    setWarning(null);
    const parsed = parseStremioInput(value);
    if (parsed.kind === "error") return setError(parsed.reason);
    setStep("Starting…");
    let keepOpen = false;
    try {
      if (parsed.kind === "link") {
        const resolved = await files.playLink(stream, parsed.url, setStep);
        if (resolved.warning) {
          setWarning(resolved.warning);
          keepOpen = true;
        }
      } else {
        const base = await requireStremio();
        const choice = await openTorrent(base, parsed.infoHash, parsed.trackers, setStep);
        const wanted = stream.file && stream.file.size > 0 ? choice.videos.find((video) => video.length === stream.file!.size) : (choice.videos.find((video) => video.index === parsed.fileIdx) ?? choice.videos[0]);
        if (!wanted) throw new Error("No file in that torrent is the same size as this video.");
        const resolved = await resolveTorrentFile(base, parsed.infoHash, choice, wanted.index, setStep);
        if (stream.file && !sameMedia({ size: stream.file.size, duration: stream.file.duration }, resolved)) {
          throw new Error("That's a different video: its length or size doesn't match the one in the room.");
        }
        await files.adoptSource(stream.id, resolved);
      }
      if (!keepOpen) onClose();
    } catch (problem) {
      setError(friendlyError(problem, problem instanceof Error ? problem.message : "Couldn't open that link."));
    } finally {
      setStep(null);
    }
  }

  return (
    <Sheet title={owner ? "Replace the link" : "Use your own link"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <p className="text-sm leading-relaxed text-label-2">
          {owner
            ? "Paste a fresh link to the same video, for example after the old one expired. Everyone stays in sync."
            : "Paste a link or magnet to the same video. You'll play your own copy in full quality, in sync with the room."}{" "}
          It stays in this tab and is never sent to the room or our server.
        </p>
        <label className="flex items-center gap-3 rounded-xl bg-panel-2 px-4 py-3 focus-within:ring-2 focus-within:ring-accent">
          <LinkIcon className="shrink-0 text-lg text-label-2" />
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a video link or magnet"
            aria-label="Video link or magnet"
            aria-invalid={Boolean(error)}
            disabled={busy}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-label-3"
          />
        </label>
        <div className="min-h-6 space-y-2 text-sm" aria-live="polite">
          {step && <p className="text-label-2">{step}</p>}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          {warning && <p className="text-warn">{warning}</p>}
        </div>
        <StremioConnection />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="h-12 w-full rounded-xl bg-accent px-4 font-semibold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
        >
          {busy ? "Checking…" : owner ? "Replace link" : "Use this link"}
        </button>
      </form>
    </Sheet>
  );
}
