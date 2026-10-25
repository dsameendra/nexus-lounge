import type { MediaSource } from "@nexus/shared";

export function fallbackTitle(source: MediaSource) {
  if (source.type === "local") return "Local video";
  if (source.type === "youtube") return "YouTube video";
  return source.isLive ? source.id : `Twitch broadcast ${source.id}`;
}

export async function fetchTitle(source: MediaSource) {
  if (source.type !== "youtube") return null;
  try {
    const target = `https://www.youtube.com/watch?v=${source.id}`;
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: unknown };
    return typeof data.title === "string" ? data.title.slice(0, 140) : null;
  } catch {
    return null;
  }
}
