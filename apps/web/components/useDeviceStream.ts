"use client";

import { useCallback } from "react";
import type { Stream } from "@nexus/shared";
import { friendlyError } from "@/lib/remote-media";
import { pickFile, type PickedFile } from "@/lib/local-files";
import { NOT_THE_SAME_FILE, useLocalFiles } from "./LocalFilesProvider";
import { useRoom } from "./RoomProvider";

export const OWN_LABEL = { local: "I have this file", torrent: "Play with my Stremio", link: "I have this video" } as const;

// What a person can do with a stream whose picture comes from a device: play their own copy, or go back to the owner's
// live feed. Used by the stream list and the player so both always show the same state.
export function useDeviceStream(stream: Stream | null) {
  const files = useLocalFiles();
  const { self } = useRoom();
  const id = stream?.id ?? "";
  const { busy, problem } = files.note(id);
  const entry = stream ? files.entry(stream.id) : undefined;
  const kind = (stream?.source.type ?? "local") as keyof typeof OWN_LABEL;

  const run = useCallback(
    async (work: () => Promise<unknown>, fallback: string) => {
      files.setNote(id, { busy: true, problem: null });
      try {
        await work();
        files.setNote(id, { busy: false });
      } catch (error) {
        files.setNote(id, { busy: false, problem: friendlyError(error, fallback) });
      }
    },
    [files, id],
  );

  const attach = useCallback(
    async (picked: PickedFile | null) => {
      if (!stream || !picked) return;
      await run(() => files.attach(stream, picked), NOT_THE_SAME_FILE);
    },
    [files, stream, run],
  );

  // The main action: pick the file, open the torrent in your Stremio, or paste your own link.
  const choose = useCallback(async () => {
    if (!stream) return;
    if (kind === "local") await pickFile().then(attach);
    else if (kind === "torrent") await run(() => files.playTorrent(stream), "Couldn't open this torrent in Stremio.");
    else files.openLinkSheet(stream.id);
  }, [stream, kind, attach, run, files]);

  const resume = useCallback(async () => {
    if (!stream) return;
    files.setNote(id, { busy: true, problem: null });
    const message = await files.resume(stream);
    files.setNote(id, { busy: false, problem: message });
  }, [files, stream, id]);

  const release = useCallback(() => {
    if (stream) files.detach(stream.id);
  }, [files, stream]);

  return {
    kind,
    entry,
    owner: stream?.addedBy.id === self.id,
    remembered: stream ? files.remembered(stream.id) : null,
    busy,
    problem,
    stats: stream ? files.stats(stream.id) : null,
    ownLabel: OWN_LABEL[kind],
    attach,
    choose,
    resume,
    release,
    replaceLink: kind === "link" && stream ? () => files.openLinkSheet(stream.id) : null,
  };
}
