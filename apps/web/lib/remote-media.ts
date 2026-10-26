"use client";

import { isSubtitleFileName, looksLikePlaceholder, planLink, sameMedia, titleFromUrl, videoFilesOf, type Stream } from "@nexus/shared";
import { browserCaps, directPlayable } from "./codecs";
import type { EntrySource } from "./local-entry";
import { checkStremio, createTorrent, getStremioBase, getStremioStatus, hlsUrl, probeMedia, statusMessage, torrentFileUrl, type TorrentInfo } from "./stremio";

// A problem with a message that is safe and useful to show.
export class ResolveError extends Error {}

export interface Resolved {
  source: EntrySource;
  size: number;
  duration: number;
  name: string;
  how: "direct" | "stremio";
  warning: string | null;
}

type Step = (message: string) => void;

export async function requireStremio(): Promise<string> {
  const status = getStremioStatus() === "connected" ? "connected" : await checkStremio();
  if (status !== "connected") throw new ResolveError(statusMessage[status === "checking" ? "offline" : status]);
  return getStremioBase();
}

interface Remote {
  status: number;
  finalUrl: string;
  size: number;
}

// Reads a link's headers from this browser (and follows its redirects) without downloading the video. null when the
// browser isn't allowed to read it (no CORS, blocked insecure address, offline).
export async function inspectRemote(url: string, timeoutMs = 12_000): Promise<Remote | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", cache: "no-store", credentials: "omit" });
    const total = Number(response.headers.get("content-range")?.split("/")[1]);
    const length = Number(response.headers.get("content-length"));
    controller.abort();
    return { status: response.status, finalUrl: response.url || url, size: Number.isFinite(total) && total > 0 ? total : Number.isFinite(length) && length > 0 ? length : 0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function loadDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    const done = (value: number | null) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 25_000);
    video.onloadedmetadata = () => done(video.videoWidth > 0 && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

const LINK_ADVICE: Record<"insecure" | "blocked" | "codecs", string> = {
  insecure: "This link goes through an insecure (http) address that browsers block. Open Stremio and try again: it can play it for you.",
  blocked: "This browser isn't allowed to read that link (the service doesn't permit it). Open Stremio and try again: it can play it for you.",
  codecs: "This video's format can't play in a browser. Open Stremio and try again: it can convert it for you.",
};

export async function resolveLink(url: string, stremioBase: string | null, step: Step = () => {}): Promise<Resolved> {
  const pageSecure = location.protocol === "https:";
  step("Checking the link…");
  const remote = await inspectRemote(url);
  if (remote && remote.status >= 400) throw new ResolveError(`The link doesn't work (the service answered ${remote.status}). It may have expired.`);
  const finalIsHttp = remote ? remote.finalUrl.startsWith("http:") : url.startsWith("http:");

  // An insecure address is blocked on an https page, but many hosts answer on https too: try that before giving up.
  let upgraded: { url: string; remote: Remote } | null = null;
  const insecureAddress = remote ? remote.finalUrl : url;
  if (finalIsHttp && pageSecure && insecureAddress.startsWith("http:")) {
    const candidate = insecureAddress.replace(/^http:/, "https:");
    const retry = await inspectRemote(candidate, 8000);
    if (retry && retry.status < 400) upgraded = { url: candidate, remote: retry };
  }

  let probe = null;
  if (stremioBase) {
    step("Asking Stremio to read it…");
    probe = await probeMedia(stremioBase, url, 60_000);
  }

  const plan = planLink({
    pageSecure,
    reachable: Boolean(remote) || Boolean(upgraded),
    finalIsHttp,
    httpsRetryOk: Boolean(upgraded),
    stremio: Boolean(stremioBase && probe),
    directPlayable: probe ? directPlayable(probe) : null,
  });
  if (plan.how === "none") throw new ResolveError(stremioBase ? "Stremio couldn't read that link either. It may have expired." : LINK_ADVICE[plan.reason]);

  const name = titleFromUrl(url);
  const subs = stremioBase && probe && probe.subtitleTracks > 0 ? { base: stremioBase, mediaUrl: url, embedded: true, extras: [] } : undefined;
  if (plan.how === "stremio" && stremioBase && probe) {
    const size = remote?.size ?? 0;
    return { source: { kind: "url", url: hlsUrl(stremioBase, url, browserCaps()), hls: true, subs }, size, duration: probe.duration, name, how: "stremio", warning: looksLikePlaceholder({ size, duration: probe.duration }) ? PLACEHOLDER : null };
  }

  const playUrl = plan.how === "direct" && plan.upgrade && upgraded ? upgraded.url : url;
  const size = (plan.how === "direct" && plan.upgrade && upgraded ? upgraded.remote.size : remote?.size) ?? 0;
  step("Loading the video…");
  const duration = probe?.duration ?? (await loadDuration(playUrl));
  if (!duration) throw new ResolveError(LINK_ADVICE.codecs);
  return { source: { kind: "url", url: playUrl, hls: false, subs }, size, duration, name, how: "direct", warning: looksLikePlaceholder({ size, duration }) ? PLACEHOLDER : null };
}

const PLACEHOLDER = "This looks like a very short clip, maybe an error video. The link may have expired or been limited by its service.";

export async function resolveLinkForStream(stream: Stream, url: string, stremioBase: string | null, step: Step = () => {}) {
  const resolved = await resolveLink(url, stremioBase, step);
  if (stream.file && !sameMedia({ size: stream.file.size, duration: stream.file.duration }, resolved)) {
    throw new ResolveError("That's a different video: its length or size doesn't match the one in the room.");
  }
  return resolved;
}

export interface TorrentChoice {
  info: TorrentInfo;
  videos: { index: number; name: string; length: number }[];
}

export async function openTorrent(base: string, infoHash: string, trackers: string[], step: Step = () => {}): Promise<TorrentChoice> {
  step("Opening the torrent in Stremio…");
  let info: TorrentInfo;
  try {
    info = await createTorrent(base, infoHash, trackers);
  } catch (error) {
    void checkStremio();
    throw new ResolveError(error instanceof ResolveError || (error instanceof Error && error.message.startsWith("Stremio")) ? (error as Error).message : "Stremio didn't answer. Is it still running?");
  }
  const videos = videoFilesOf(info.files);
  if (videos.length === 0) throw new ResolveError("That torrent has no video file in it.");
  return { info, videos };
}

const prettyName = (name: string) => titleFromUrl(`https://x.invalid/${encodeURIComponent(name)}`);

export async function resolveTorrentFile(base: string, infoHash: string, choice: TorrentChoice, fileIdx: number, step: Step = () => {}): Promise<Resolved> {
  const file = choice.info.files[fileIdx];
  if (!file) throw new ResolveError("That file isn't in the torrent.");
  const mediaUrl = torrentFileUrl(base, infoHash, fileIdx);
  step("Waiting for peers and reading the video…");
  const probe = await probeMedia(base, mediaUrl, 120_000);
  if (!probe) throw new ResolveError("Stremio couldn't read the video. The torrent may have no peers right now: try again in a moment.");
  const torrent = { base, infoHash, fileIdx };
  const direct = directPlayable(probe);
  const extras = choice.info.files.flatMap((item, index) => (isSubtitleFileName(item.name) ? [{ index, name: item.name, infoHash }] : []));
  const subs = probe.subtitleTracks > 0 || extras.length > 0 ? { base, mediaUrl, embedded: probe.subtitleTracks > 0, extras } : undefined;
  return {
    source: direct ? { kind: "url", url: mediaUrl, hls: false, torrent, subs } : { kind: "url", url: hlsUrl(base, mediaUrl, browserCaps()), hls: true, torrent, subs },
    size: file.length,
    duration: probe.duration,
    name: prettyName(file.name),
    how: direct ? "direct" : "stremio",
    warning: null,
  };
}

export function torrentParts(stream: Stream) {
  const [infoHash, index] = stream.source.id.split("-");
  return { infoHash: infoHash!, fileIdx: Number(index) };
}

// A friend opening a torrent that is already in the room: same file, checked against what the owner added.
export async function resolveTorrentForStream(base: string, stream: Stream, step: Step = () => {}) {
  const { infoHash, fileIdx } = torrentParts(stream);
  const choice = await openTorrent(base, infoHash, stream.trackers ?? [], step);
  const file = choice.info.files[fileIdx];
  if (!file) throw new ResolveError("That file isn't in the torrent.");
  if (stream.file && stream.file.size > 0 && file.length !== stream.file.size) throw new ResolveError("That isn't the same file as the one in the room.");
  const resolved = await resolveTorrentFile(base, infoHash, choice, fileIdx, step);
  if (stream.file && !sameMedia({ size: stream.file.size, duration: stream.file.duration }, resolved)) throw new ResolveError("That isn't the same video as the one in the room.");
  return resolved;
}

// Safari won't let this page ask Stremio anything, but a video can still load from it: play without the checks.
export function blindTorrentSource(base: string, stream: Stream): EntrySource {
  const { infoHash, fileIdx } = torrentParts(stream);
  return { kind: "url", url: hlsUrl(base, torrentFileUrl(base, infoHash, fileIdx), browserCaps()), hls: true, torrent: { base, infoHash, fileIdx } };
}

export function friendlyError(error: unknown, fallback: string) {
  return error instanceof ResolveError ? error.message : fallback;
}
