"use client";

import type { Stream } from "@nexus/shared";
import { CheckIcon, FilmIcon, SyncIcon } from "./Icons";
import { useLocalFiles } from "./LocalFilesProvider";
import { useLocalFileActions } from "./useLocalFileActions";

const action =
  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition active:scale-95 disabled:opacity-50";
const quiet = `${action} bg-white/10 hover:bg-white/15`;
const strong = `${action} bg-accent font-semibold hover:brightness-110`;

// Sits under a local file's card in the stream list so the choice is always visible:
// watch the owner's live feed, or point the app at your own copy of the file.
export function LocalFileFooter({ stream }: { stream: Stream }) {
  const files = useLocalFiles();
  const { entry, owner, remembered, busy, problem, choose, resume, release } = useLocalFileActions(stream);
  const who = owner ? "You" : stream.addedBy.name;
  const live = files.sharing === stream.id;

  let status: React.ReactNode;
  let buttons: React.ReactNode = null;

  if (owner && entry) {
    status = live ? (
      <>
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-live" /> Sharing live from your device. Keep this tab open.
      </>
    ) : (
      <>
        <CheckIcon className="shrink-0 text-live" /> Playing from your device. Friends can watch a live feed.
      </>
    );
  } else if (owner) {
    status = <span className="text-warn">Friends are waiting. Open the file again to keep sharing.</span>;
    buttons = (
      <>
        {remembered && (
          <button type="button" disabled={busy} onClick={() => void resume()} className={strong}>
            Resume
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void choose()} className={remembered ? quiet : strong}>
          <FilmIcon /> {remembered ? "Choose again" : "Open file"}
        </button>
      </>
    );
  } else if (entry) {
    status = (
      <>
        <CheckIcon className="shrink-0 text-live" /> Playing your copy
      </>
    );
    buttons = (
      <button type="button" onClick={release} aria-label={`Use live feed: ${stream.title}`} className={quiet}>
        <SyncIcon /> Use live feed
      </button>
    );
  } else {
    status = <>Watching {who}&apos;s live feed</>;
    buttons = (
      <>
        {remembered && (
          <button type="button" disabled={busy} onClick={() => void resume()} aria-label={`Resume ${remembered}`} className={strong}>
            Resume
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose()}
          aria-label={busy ? undefined : `I have this file: ${stream.title}`}
          title="Play your own copy of this file instead of the live feed"
          className={remembered ? quiet : strong}
        >
          <FilmIcon /> {busy ? "Checking the file…" : "I have this file"}
        </button>
      </>
    );
  }

  return (
    <div className="relative z-10 mt-2.5 border-t border-white/5 pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-xs leading-snug text-label-2">{status}</p>
        {buttons && <div className="flex flex-wrap items-center gap-2">{buttons}</div>}
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-xs leading-snug text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
