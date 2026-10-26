"use client";

import { useSyncExternalStore } from "react";
import { isPrivateHost, type LinkFacts } from "@nexus/shared";

export const DEFAULT_SERVER = "http://127.0.0.1:11470";
const KEY = "nexus-stremio-server";
const FORCE_KEY = "nexus-stremio-force";

// connected: answers. offline: nothing answered. denied: Chrome's local-network permission was refused.
// insecure: this browser won't let an https page call an http Stremio (Safari); playing still works, checking doesn't.
export type StremioStatus = "unknown" | "checking" | "connected" | "offline" | "denied" | "insecure";

interface State {
  base: string;
  status: StremioStatus;
}

export function normalizeServerUrl(input: string) {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readBase() {
  try {
    return normalizeServerUrl(localStorage.getItem(KEY) ?? "") ?? DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
}

let state: State = { base: DEFAULT_SERVER, status: "unknown" };
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = { ...state, base: readBase() };
}
function set(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

export const getStremioBase = () => (load(), state.base);
export const getStremioStatus = () => (load(), state.status);

export function setStremioBase(input: string) {
  const base = normalizeServerUrl(input);
  if (!base) return false;
  try {
    if (base === DEFAULT_SERVER) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, base);
  } catch {}
  set({ base, status: "unknown" });
  return true;
}

// Chrome and Edge ask once before a website may reach devices on your own network; the address space hint
// also lets that request through the mixed-content rules.
export async function serverFetch(base: string, path: string, init: RequestInit = {}, timeoutMs = 8000) {
  const host = new URL(base).hostname;
  const space = host === "localhost" || host === "127.0.0.1" || host === "[::1]" ? "loopback" : isPrivateHost(host) ? "local" : undefined;
  const attempt = async (hint?: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${base}${path}`, { ...init, signal: controller.signal, ...(hint ? { targetAddressSpace: hint } : {}) } as RequestInit);
    } finally {
      clearTimeout(timer);
    }
  };
  if (!space) return attempt();
  try {
    return await attempt(space);
  } catch (error) {
    // A browser that doesn't know the hint rejects the request itself: try once more without it.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return attempt();
  }
}

async function diagnose(base: string): Promise<StremioStatus> {
  try {
    const forced = localStorage.getItem(FORCE_KEY);
    if (forced) return forced as StremioStatus;
  } catch {}
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  if (secure && base.startsWith("http:")) {
    try {
      const permission = await navigator.permissions.query({ name: "local-network-access" as PermissionName });
      if (permission.state === "denied") return "denied";
    } catch {}
    if (/^((?!chrome|chromium|android|firefox|edg).)*safari/i.test(navigator.userAgent)) return "insecure";
  }
  return "offline";
}

export async function checkStremio(): Promise<StremioStatus> {
  load();
  const base = state.base;
  set({ status: "checking" });
  let status: StremioStatus;
  try {
    const forced = localStorage.getItem(FORCE_KEY);
    if (forced) {
      status = forced as StremioStatus;
    } else {
      const response = await serverFetch(base, "/settings", {}, 4500);
      status = response.ok ? "connected" : "offline";
    }
  } catch {
    status = await diagnose(base);
  }
  if (state.base === base) set({ status });
  return status;
}

export function useStremio() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${getStremioBase()}|${getStremioStatus()}`,
    () => `${DEFAULT_SERVER}|unknown`,
  );
  const [base, status] = snapshot.split("|") as [string, StremioStatus];
  return { base, status, check: checkStremio, setBase: setStremioBase, connected: status === "connected", insecure: status === "insecure" };
}

export const statusMessage: Record<Exclude<StremioStatus, "connected" | "checking">, string> = {
  unknown: "Stremio hasn't been checked yet.",
  offline: "Couldn't reach Stremio. Open the Stremio app on this computer and keep it running, then try again.",
  denied: "Your browser blocked the connection to Stremio. Allow this site to connect to devices on your network in the site settings (the padlock in the address bar), then try again.",
  insecure: "Your browser doesn't let this page talk to Stremio, so it can't check or list torrents. Chrome, Edge or Firefox can; playing a stream someone else added still works here.",
};

export interface TorrentInfo {
  name: string;
  files: { name: string; path: string; length: number }[];
}

export async function createTorrent(base: string, infoHash: string, trackers: string[]): Promise<TorrentInfo> {
  const sources = [`dht:${infoHash}`, ...trackers.map((tracker) => `tracker:${tracker}`)];
  const response = await serverFetch(
    base,
    `/${infoHash}/create`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ torrent: { infoHash, peerSearch: { sources, min: 40, max: 150 } } }) },
    90_000,
  );
  if (!response.ok) throw new Error("Stremio couldn't open that torrent.");
  const data = (await response.json()) as { name?: string; files?: { name: string; path: string; length: number }[] };
  return { name: data.name ?? "Torrent", files: Array.isArray(data.files) ? data.files : [] };
}

export interface TorrentStats {
  progress: number;
  speed: number;
  peers: number;
}

export async function torrentStats(base: string, infoHash: string, fileIdx: number): Promise<TorrentStats | null> {
  try {
    const response = await serverFetch(base, `/${infoHash}/${fileIdx}/stats.json`, {}, 5000);
    if (!response.ok) return null;
    const data = (await response.json()) as { streamProgress?: number; downloadSpeed?: number; peers?: number };
    return { progress: Math.min(1, Math.max(0, data.streamProgress ?? 0)), speed: data.downloadSpeed ?? 0, peers: data.peers ?? 0 };
  } catch {
    return null;
  }
}

export interface Probe {
  container: string;
  duration: number;
  video: string | null;
  audio: string | null;
  subtitleTracks: number;
}

// Stremio fetches the address itself, so this also works for links this browser can't read.
export async function probeMedia(base: string, mediaUrl: string, timeoutMs = 90_000): Promise<Probe | null> {
  try {
    const response = await serverFetch(base, `/hlsv2/probe?mediaURL=${encodeURIComponent(mediaUrl)}`, {}, timeoutMs);
    if (!response.ok) return null;
    const data = (await response.json()) as { format?: { name?: string; duration?: number }; streams?: { track: string; codec: string }[] };
    const streams = data.streams ?? [];
    const duration = Number(data.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return {
      container: data.format?.name ?? "",
      duration,
      video: streams.find((stream) => stream.track === "video")?.codec ?? null,
      audio: streams.find((stream) => stream.track === "audio")?.codec ?? null,
      subtitleTracks: streams.filter((stream) => stream.track === "subtitle").length,
    };
  } catch {
    return null;
  }
}

export function torrentFileUrl(base: string, infoHash: string, fileIdx: number) {
  return `${base}/${infoHash}/${fileIdx}`;
}

// A playlist Stremio builds for this browser: it copies what the browser can play and converts the rest.
export function hlsUrl(base: string, mediaUrl: string, caps: { video: string[]; audio: string[] }) {
  const id = Math.random().toString(36).slice(2, 10);
  const query = new URLSearchParams({ mediaURL: mediaUrl, videoCodecs: caps.video.join(","), audioCodecs: caps.audio.join(","), maxAudioChannels: "2" });
  return `${base}/hlsv2/${id}/master.m3u8?${query}`;
}

export type { LinkFacts };
