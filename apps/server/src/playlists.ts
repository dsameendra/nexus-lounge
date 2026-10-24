import { LIMITS, YOUTUBE_VIDEO_ID, type PlaylistItem } from "@nexus/shared";

export interface LoadedPlaylist {
  title: string;
  items: PlaylistItem[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: LoadedPlaylist }>();

function text(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { simpleText?: unknown; runs?: { text?: unknown }[] };
  if (typeof node.simpleText === "string") return node.simpleText;
  return Array.isArray(node.runs) ? node.runs.map((run) => (typeof run.text === "string" ? run.text : "")).join("") : "";
}

function collect(node: unknown, found: PlaylistItem[], seen: Set<string>) {
  if (found.length >= LIMITS.playlistItems || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, found, seen);
    return;
  }
  const record = node as Record<string, unknown>;
  const lockup = record.lockupViewModel as
    | { contentId?: unknown; contentType?: unknown; metadata?: { lockupMetadataViewModel?: { title?: { content?: unknown } } } }
    | undefined;
  if (lockup) {
    const id = lockup.contentId;
    if (lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && typeof id === "string" && YOUTUBE_VIDEO_ID.test(id) && !seen.has(id)) {
      seen.add(id);
      const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
      found.push({ id, title: (typeof title === "string" ? title : "").slice(0, 120) || "YouTube video" });
    }
    return;
  }
  const renderer = record.playlistVideoRenderer as { videoId?: unknown; title?: unknown; isPlayable?: unknown } | undefined;
  if (renderer) {
    const id = renderer.videoId;
    if (typeof id === "string" && YOUTUBE_VIDEO_ID.test(id) && renderer.isPlayable !== false && !seen.has(id)) {
      seen.add(id);
      found.push({ id, title: text(renderer.title).slice(0, 120) || "YouTube video" });
    }
    return;
  }
  for (const child of Object.values(record)) collect(child, found, seen);
}

export function parsePlaylistPage(html: string): LoadedPlaylist | null {
  const match = /ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
  if (!match) return null;
  let data: unknown;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }
  const items: PlaylistItem[] = [];
  collect((data as { contents?: unknown }).contents, items, new Set());
  if (items.length === 0) return null;
  const metadata = (data as { metadata?: { playlistMetadataRenderer?: { title?: unknown } } }).metadata?.playlistMetadataRenderer;
  const title = typeof metadata?.title === "string" ? metadata.title : "";
  return { title: title.slice(0, 120) || "YouTube playlist", items };
}

export async function fetchPlaylist(listId: string): Promise<LoadedPlaylist | null> {
  const cached = cache.get(listId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const response = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=en`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        cookie: "CONSENT=YES+1; SOCS=CAI",
      },
    });
    if (!response.ok) return null;
    const value = parsePlaylistPage(await response.text());
    if (value) {
      if (cache.size > 50) cache.clear();
      cache.set(listId, { at: Date.now(), value });
    }
    return value;
  } catch {
    return null;
  }
}
