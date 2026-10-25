"use client";

import { useCallback } from "react";
import type { Stream } from "@nexus/shared";
import { pickFile, type PickedFile } from "@/lib/local-files";
import { NOT_THE_SAME_FILE, useLocalFiles } from "./LocalFilesProvider";
import { useRoom } from "./RoomProvider";

// What a person can do with a local file stream: use their own copy, pick it again, or go back to the live feed.
// Used by the stream list and the player, so both show the same state.
export function useLocalFileActions(stream: Stream | null) {
  const files = useLocalFiles();
  const { self } = useRoom();
  const id = stream?.id ?? "";
  const { busy, problem } = files.note(id);
  const entry = stream ? files.entry(stream.id) : undefined;

  const attach = useCallback(
    async (picked: PickedFile | null) => {
      if (!stream || !picked) return;
      files.setNote(id, { busy: true, problem: null });
      try {
        await files.attach(stream, picked);
        files.setNote(id, { busy: false });
      } catch (error) {
        files.setNote(id, { busy: false, problem: error instanceof Error ? error.message : NOT_THE_SAME_FILE });
      }
    },
    [files, stream, id],
  );

  const choose = useCallback(() => pickFile().then(attach), [attach]);

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
    entry,
    owner: stream?.addedBy.id === self.id,
    remembered: stream ? files.remembered(stream.id) : null,
    busy,
    problem,
    attach,
    choose,
    resume,
    release,
  };
}
