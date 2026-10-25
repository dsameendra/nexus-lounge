"use client";

import type { Stream } from "@nexus/shared";
import { CheckIcon, FilmIcon, LinkIcon, SyncIcon } from "./Icons";
import { useLocalFiles } from "./LocalFilesProvider";
import { useStremio } from "@/lib/stremio";
import { StremioConnection } from "./StremioConnection";
import { useDeviceStream } from "./useDeviceStream";

const action = "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition active:scale-95 disabled:opacity-50";
const quiet = `${action} bg-white/10 hover:bg-white/15`;
const strong = `${action} bg-accent font-semibold hover:brightness-110`;

const speed = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB/s` : `${Math.round(bytes / 1e3)} KB/s`);

// Sits under a stream from someone's device (a file, a torrent, a link) so the choice is always visible:
// watch the owner's live feed, or play your own copy.
export function DeviceFooter({ stream }: { stream: Stream }) {
  const files = useLocalFiles();
  const d = useDeviceStream(stream);
  const stremio = useStremio();
  // When Stremio itself is the problem, its own card explains it and says what to do; one message is enough.
  const stremioDown = d.kind === "torrent" && Boolean(d.problem) && !d.entry && stremio.status !== "connected" && stremio.status !== "checking";
  const who = d.owner ? "You" : stream.addedBy.name;
  const live = files.sharing === stream.id;
  const icon = d.kind === "link" ? <LinkIcon /> : <FilmIcon />;
  const progress = d.stats && d.entry ? `${Math.round(d.stats.progress * 100)}% downloaded · ${speed(d.stats.speed)} · ${d.stats.peers} ${d.stats.peers === 1 ? "peer" : "peers"}` : null;

  let status: React.ReactNode;
  let buttons: React.ReactNode = null;

  if (d.owner && d.entry) {
    status = live ? (
      <>
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-live" /> Sharing live from your device. Keep this tab open.
      </>
    ) : (
      <>
        <CheckIcon className="shrink-0 text-live" /> {d.kind === "local" ? "Playing from your device." : d.kind === "torrent" ? "Playing through your Stremio." : "Playing your link."} Friends can watch a live feed.
      </>
    );
    if (d.replaceLink) {
      buttons = (
        <button type="button" onClick={d.replaceLink} aria-label={`Replace the link for ${stream.title}`} className={quiet}>
          <LinkIcon /> Replace link
        </button>
      );
    }
  } else if (d.owner) {
    status = <span className="text-warn">Friends are waiting. {d.kind === "local" ? "Open the file again" : d.kind === "torrent" ? "Reconnect your Stremio" : "Paste the link again"} to keep sharing.</span>;
    buttons = (
      <>
        {d.kind === "local" && d.remembered && (
          <button type="button" disabled={d.busy} onClick={() => void d.resume()} className={strong}>
            Resume
          </button>
        )}
        <button type="button" disabled={d.busy} onClick={() => void d.choose()} className={d.kind === "local" && d.remembered ? quiet : strong}>
          {icon} {d.busy ? "Working…" : d.kind === "local" ? (d.remembered ? "Choose again" : "Open file") : d.kind === "torrent" ? "Use my Stremio" : "Paste link"}
        </button>
      </>
    );
  } else if (d.entry) {
    status = (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <CheckIcon className="shrink-0 text-live" /> Playing your copy
        </span>
        {progress && <span className="text-label-3">{progress}</span>}
      </span>
    );
    buttons = (
      <button type="button" onClick={d.release} aria-label={`Use live feed: ${stream.title}`} className={quiet}>
        <SyncIcon /> Use live feed
      </button>
    );
  } else {
    status = <>Watching {who}&apos;s live feed</>;
    buttons = (
      <>
        {d.kind === "local" && d.remembered && (
          <button type="button" disabled={d.busy} onClick={() => void d.resume()} aria-label={`Resume ${d.remembered}`} className={strong}>
            Resume
          </button>
        )}
        <button
          type="button"
          disabled={d.busy}
          onClick={() => void d.choose()}
          aria-label={d.busy ? undefined : `${d.ownLabel}: ${stream.title}`}
          title={d.kind === "torrent" ? "Download it with your own Stremio and play it in sync, in full quality" : d.kind === "link" ? "Paste your own link to this video and play it in sync" : "Play your own copy of this file instead of the live feed"}
          className={d.kind === "local" && d.remembered ? quiet : strong}
        >
          {icon} {d.busy ? (d.kind === "local" ? "Checking the file…" : "Connecting…") : d.ownLabel}
        </button>
      </>
    );
  }

  return (
    <div className="relative z-10 mt-2.5 border-t border-white/5 pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-xs leading-snug text-label-2">{status}</div>
        {buttons && <div className="flex flex-wrap items-center gap-2">{buttons}</div>}
      </div>
      {d.problem && !stremioDown && (
        <p role="alert" className="mt-2 text-xs leading-snug text-danger">
          {d.problem}
        </p>
      )}
      {stremioDown && <StremioConnection className="mt-2" />}
    </div>
  );
}
