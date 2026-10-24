"use client";

import { useMemo, useState } from "react";
import { parseMediaUrl, streamKey } from "@nexus/shared";
import { CheckIcon, LinkIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { Sheet } from "./Sheet";

export function AddStreamSheet({ onClose }: { onClose: () => void }) {
  const { send, isController, select } = useRoom();
  const [value, setValue] = useState("");
  const result = useMemo(() => (value.trim() ? parseMediaUrl(value) : null), [value]);
  const source = result?.ok ? result.source : null;

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

  const primary = isController ? "everyone" : "me";
  const label = source ? (source.type === "youtube" ? (source.isLive ? "YouTube live" : "YouTube video") : source.isLive ? `Twitch channel · ${source.id}` : "Twitch broadcast") : null;

  return (
    <Sheet title="Add a stream" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add(primary);
        }}
        className="space-y-4"
      >
        <label className="flex items-center gap-3 rounded-xl bg-panel-2 px-4 py-3 focus-within:ring-2 focus-within:ring-accent">
          <LinkIcon className="shrink-0 text-lg text-label-2" />
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a YouTube or Twitch link"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-label-3"
          />
        </label>

        <div className="min-h-6 text-sm">
          {result && !result.ok && <p className="text-danger">{result.reason}</p>}
          {label && (
            <p className="flex items-center gap-2 text-live">
              <CheckIcon /> {label}
            </p>
          )}
          {!result && <p className="text-label-2">Videos, past broadcasts, live streams and channels all work.</p>}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
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
