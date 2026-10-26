import { cleanFileName } from "./local-file.ts";

export const TORRENT_ID = /^[a-f0-9]{40}-\d{1,4}$/;
export const MAX_TRACKERS = 8;
export const MAX_LINK_LENGTH = 4000;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32ToHex(text: string) {
  let bits = "";
  for (const char of text.toUpperCase()) {
    const value = BASE32.indexOf(char);
    if (value === -1) return null;
    bits += value.toString(2).padStart(5, "0");
  }
  let hex = "";
  for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.slice(0, 40);
}

// 40 hex characters, or the 32-character base32 form some magnets use.
export function infoHashFrom(text: string) {
  const value = text.trim();
  if (/^[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
  if (/^[A-Za-z2-7]{32}$/.test(value)) return base32ToHex(value);
  return null;
}

export function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!host.includes(".") && !host.includes(":")) return true;
  if (host === "localhost" || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (host.includes(":")) return host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:");
  return false;
}

// A tracker another person asked your Stremio to contact: public hosts only, so nobody can aim it at your own network.
export function sanitizeTracker(raw: string) {
  if (raw.length > 200) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!["udp:", "http:", "https:", "ws:", "wss:"].includes(url.protocol)) return null;
  if (url.username || url.password || !url.hostname || isPrivateHost(url.hostname)) return null;
  if (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) return null;
  return url.toString();
}

export function sanitizeTrackers(list: string[]) {
  const seen = new Set<string>();
  for (const item of list) {
    const tracker = sanitizeTracker(item.trim());
    if (tracker) seen.add(tracker);
    if (seen.size >= MAX_TRACKERS) break;
  }
  return [...seen];
}

export type StremioInput =
  | { kind: "torrent"; infoHash: string; fileIdx: number | null; trackers: string[]; name: string | null }
  | { kind: "link"; url: string }
  | { kind: "error"; reason: string };

const STREMIO_PORTS = new Set(["11470", "12470"]);

function cleanName(value: string | null) {
  return value ? cleanFileName(value) : null;
}

export function parseStremioInput(input: string): StremioInput {
  const text = input.trim();
  if (!text) return { kind: "error", reason: "Paste a magnet link, a Stremio stream link or a video link." };
  if (text.length > MAX_LINK_LENGTH) return { kind: "error", reason: "That link is too long." };

  if (/^magnet:/i.test(text)) {
    let params: URLSearchParams;
    try {
      params = new URL(text).searchParams;
    } catch {
      return { kind: "error", reason: "That magnet link isn't valid." };
    }
    const xt = params.getAll("xt").find((value) => /^urn:btih:/i.test(value));
    const infoHash = xt ? infoHashFrom(xt.replace(/^urn:btih:/i, "")) : null;
    if (!infoHash) return { kind: "error", reason: "That magnet link has no usable torrent hash." };
    const soText = params.get("so")?.split(",")[0]?.trim();
    const so = soText ? Number(soText) : NaN;
    return { kind: "torrent", infoHash, fileIdx: Number.isInteger(so) && so >= 0 && so < 10000 ? so : null, trackers: sanitizeTrackers(params.getAll("tr")), name: cleanName(params.get("dn")) };
  }

  const bare = infoHashFrom(text);
  if (bare) return { kind: "torrent", infoHash: bare, fileIdx: null, trackers: [], name: null };

  if (/^stremio:/i.test(text)) return { kind: "error", reason: "Stremio page links can't be played directly. In Stremio, copy the stream's magnet or link and paste that." };

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { kind: "error", reason: "That doesn't look like a link." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "error", reason: "Only http and https links work." };
  if (url.username || url.password) return { kind: "error", reason: "Links with a username or password in them aren't supported." };
  if (/\.torrent$/i.test(url.pathname)) return { kind: "error", reason: "Torrent files aren't supported. Paste the magnet link instead." };

  const stremio = url.pathname.match(/^\/([a-fA-F0-9]{40})\/(\d{1,4})(?:\/|$)/);
  if (stremio && (isPrivateHost(url.hostname) || STREMIO_PORTS.has(url.port))) {
    return { kind: "torrent", infoHash: stremio[1]!.toLowerCase(), fileIdx: Number(stremio[2]), trackers: sanitizeTrackers(url.searchParams.getAll("tr")), name: cleanName(url.searchParams.get("dn")) };
  }
  return { kind: "link", url: url.toString() };
}

export function titleFromUrl(raw: string) {
  try {
    const segments = new URL(raw).pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    let name = last;
    try {
      name = decodeURIComponent(last);
    } catch {}
    const pretty = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[._]+/g, " ").trim();
    return cleanFileName(pretty || "Video");
  } catch {
    return "Video";
  }
}

export function torrentStreamId(infoHash: string, fileIdx: number) {
  return `${infoHash}-${fileIdx}`;
}

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mkv|webm|mov|avi|wmv|flv|ts|m2ts|mpg|mpeg|ogv)$/i;

// Video files in a torrent, biggest first (the usual choice for a film).
export function videoFilesOf(files: { name: string; length: number }[]) {
  return files
    .map((file, index) => ({ index, name: file.name, length: file.length }))
    .filter((file) => VIDEO_EXTENSIONS.test(file.name))
    .sort((a, b) => b.length - a.length);
}

export interface LinkFacts {
  pageSecure: boolean;
  reachable: boolean;
  finalIsHttp: boolean;
  httpsRetryOk: boolean;
  stremio: boolean;
  directPlayable: boolean | null;
}

export type LinkPlan = { how: "direct"; upgrade: boolean } | { how: "stremio" } | { how: "none"; reason: "insecure" | "blocked" | "codecs" };

// How a video link is going to play, from what the owner's browser could find out about it.
export function planLink(facts: LinkFacts): LinkPlan {
  const insecure = facts.pageSecure && facts.finalIsHttp;
  const upgrade = insecure && facts.httpsRetryOk;
  const reachable = facts.reachable && (!insecure || upgrade);
  if (reachable && facts.directPlayable !== false) return { how: "direct", upgrade };
  if (facts.stremio) return { how: "stremio" };
  if (insecure && !upgrade) return { how: "none", reason: "insecure" };
  if (!facts.reachable) return { how: "none", reason: "blocked" };
  return { how: "none", reason: "codecs" };
}

export interface MediaFacts {
  size: number;
  duration: number;
}

// Are two copies the same video? Sizes must match when both are known; lengths must agree.
export function sameMedia(expected: MediaFacts, actual: MediaFacts) {
  const bothSizes = expected.size > 0 && actual.size > 0;
  if (bothSizes && expected.size !== actual.size) return false;
  return Math.abs(expected.duration - actual.duration) <= (bothSizes ? 1.5 : 0.75);
}

// Error clips from link services are tiny: a warning for the owner, never a block.
export function looksLikePlaceholder(media: MediaFacts) {
  return (media.size > 0 && media.size < 2_000_000) || media.duration < 20;
}
