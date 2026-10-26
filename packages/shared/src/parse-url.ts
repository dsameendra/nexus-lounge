import { KICK_CHANNEL, type MediaSource } from "./types.ts";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_CHANNEL = /^[A-Za-z0-9_]{3,25}$/;
const TWITCH_RESERVED = new Set([
  "videos", "directory", "downloads", "jobs", "turbo", "settings", "subscriptions", "inventory",
  "wallet", "friends", "messages", "prime", "store", "p", "popout", "moderator", "embed", "clips",
]);

const KICK_RESERVED = new Set([
  "categories", "category", "search", "browse", "following", "dashboard", "video", "videos", "clips", "clip", "community",
  "terms-of-service", "privacy-policy", "community-guidelines", "dmca-policy", "support", "help", "login", "signup", "settings", "popout", "embed",
  "api", "app", "emotes", "store", "subscriptions", "notifications", "messages", "creator-dashboard", "kick-prime", "prime", "live", "streamers",
]);
const KICK_NOT_CHANNEL = "Kick videos and clips aren't supported. Paste a channel link (kick.com/name) to watch it live.";

export type ParseResult = { ok: true; source: MediaSource } | { ok: false; reason: string };

export function parseMediaUrl(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: "Paste a YouTube, Twitch or Kick link." };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "That doesn't look like a link." };
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0];
    return id && YOUTUBE_ID.test(id) ? youtube(id, false) : { ok: false, reason: "Couldn't find a YouTube video in that link." };
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const first = parts[0];
    if (first === "watch") {
      const id = url.searchParams.get("v");
      return id && YOUTUBE_ID.test(id) ? youtube(id, false) : { ok: false, reason: "Couldn't find a YouTube video in that link." };
    }
    if ((first === "live" || first === "embed" || first === "shorts" || first === "v") && parts[1] && YOUTUBE_ID.test(parts[1])) {
      return youtube(parts[1], first === "live");
    }
    return { ok: false, reason: "Couldn't find a YouTube video in that link." };
  }

  if (host === "clips.twitch.tv") return { ok: false, reason: "Twitch clips aren't supported. Try a channel or a past broadcast." };

  if (host === "twitch.tv") {
    const first = parts[0]?.toLowerCase();
    if (first === "videos" && parts[1] && /^\d{1,20}$/.test(parts[1])) {
      return { ok: true, source: { type: "twitch", id: parts[1], isLive: false } };
    }
    if (first === "clip" || parts[1] === "clip") return { ok: false, reason: "Twitch clips aren't supported. Try a channel or a past broadcast." };
    if (first && !TWITCH_RESERVED.has(first) && TWITCH_CHANNEL.test(first)) {
      return { ok: true, source: { type: "twitch", id: first, isLive: true } };
    }
    return { ok: false, reason: "Couldn't find a Twitch channel or video in that link." };
  }

  if (host === "kick.com" || host === "player.kick.com") {
    const first = parts[0]?.toLowerCase();
    const second = parts[1]?.toLowerCase();
    if (first === "video" || first === "videos" || first === "clip" || first === "clips" || second === "videos" || second === "clips") return { ok: false, reason: KICK_NOT_CHANNEL };
    if (!first || KICK_RESERVED.has(first)) return { ok: false, reason: "Couldn't find a Kick channel in that link." };
    // Kick writes underscores in a name as hyphens in the channel's address.
    const slug = first.replace(/_/g, "-");
    return KICK_CHANNEL.test(slug) ? { ok: true, source: { type: "kick", id: slug, isLive: true } } : { ok: false, reason: "Couldn't find a Kick channel in that link." };
  }

  return { ok: false, reason: "Only YouTube, Twitch and Kick links work for now." };
}

function youtube(id: string, isLive: boolean): ParseResult {
  return { ok: true, source: { type: "youtube", id, isLive } };
}

export const PLAYLIST_ID = /^(PL|OLAK5uy_|UU|FL)[A-Za-z0-9_-]{10,60}$/;

export function parsePlaylistId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  if (host !== "youtube.com" && host !== "youtube-nocookie.com" && host !== "youtu.be") return null;
  const list = url.searchParams.get("list");
  return list && PLAYLIST_ID.test(list) ? list : null;
}

export function isQueueable(source: MediaSource) {
  return !source.isLive && source.type !== "local" && source.type !== "torrent" && source.type !== "link";
}
