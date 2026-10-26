import type { LocalEntry } from "./local-entry";
import type { StremioLimits, TorrentStats } from "./stremio";

const RECENT_MS = 60_000;

const rate = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB/s` : `${Math.round(bytes / 1e3)} KB/s`);

// Why a stream keeps pausing, when we can tell: said only after it has stalled, never as a standing warning.
export function streamHint(entry: LocalEntry | null, stats: TorrentStats | null, limits: StremioLimits | null, now = Date.now()) {
  if (!entry || entry.source.kind !== "url") return null;
  const { perf } = entry;
  if (perf.stalls < 2 || now - perf.recentStallAt > RECENT_MS) return null;
  if (entry.source.torrent && stats) {
    if (limits && limits.downloadLimit > 0 && stats.speed >= limits.downloadLimit * 0.8) {
      return `Stremio is holding downloads to ${rate(limits.downloadLimit)}, and this video needs more than that, so it keeps pausing. A smaller or lower-quality release plays without stopping.`;
    }
    if (stats.peers === 0) return "Nobody is sending this torrent right now, so it can't keep up. Try another release with more seeders.";
    if (stats.speed < 400_000) return `The download is slow (${rate(stats.speed)} from ${stats.peers} ${stats.peers === 1 ? "peer" : "peers"}). A release with more seeders will play more smoothly.`;
  }
  if (limits?.hardwareAccel === false && entry.source.hls) return "Stremio is converting this video on the processor. Turning on hardware acceleration in Stremio's settings makes it smoother.";
  return null;
}
