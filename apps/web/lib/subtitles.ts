"use client";

import { MAX_SUBTITLE_BYTES, guessLanguage, isSubtitleFileName, languageCode, mergeVtt, srtToVtt } from "@nexus/shared";
import { browserCaps } from "./codecs";
import { hlsUrl, serverFetch, torrentFileUrl } from "./stremio";

export type SubtitleOrigin = "embedded" | "torrent" | "online" | "file";

export interface SubtitleOption {
  id: string;
  label: string;
  lang: string | null;
  origin: SubtitleOrigin;
  // WebVTT text for this track.
  load: () => Promise<string>;
}

// What a Stremio-backed stream offers: tracks inside the video and subtitle files that came with the torrent.
export interface SubtitleSource {
  base: string;
  mediaUrl: string;
  embedded: boolean;
  // The playlist this video is already playing from, so listing its tracks doesn't ask Stremio to open another session.
  master?: string;
  extras: { index: number; name: string; infoHash: string }[];
}

const PREF = "nexus-subtitles";
const SIZE = "nexus-subtitles-size";

export function readLanguagePref() {
  try {
    return localStorage.getItem(PREF);
  } catch {
    return null;
  }
}
export function writeLanguagePref(value: string) {
  try {
    localStorage.setItem(PREF, value);
  } catch {}
}
export function readSizePref() {
  try {
    const value = Number(localStorage.getItem(SIZE));
    return Number.isInteger(value) && value >= -1 && value <= 2 ? value : 0;
  } catch {
    return 0;
  }
}
export function writeSizePref(value: number) {
  try {
    localStorage.setItem(SIZE, String(value));
  } catch {}
}

export const languageName = (code: string | null) => {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

async function readText(response: Response) {
  if (!response.ok) throw new Error("The subtitle couldn't be downloaded.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_SUBTITLE_BYTES) throw new Error("That subtitle file is too big.");
  return new TextDecoder("utf-8").decode(buffer);
}

const path = (base: string, url: string) => url.slice(base.length);

async function stremioText(base: string, url: string, timeoutMs = 30_000) {
  const response = await serverFetch(base, path(base, url), {}, timeoutMs);
  if (!response.ok) throw new Error("Stremio couldn't read the subtitles.");
  return response.text();
}

// Tracks inside the video, as Stremio lists them in the playlist it builds for this browser.
async function embeddedOptions(base: string, mediaUrl: string, known?: string): Promise<SubtitleOption[]> {
  const master = known ?? hlsUrl(base, mediaUrl, browserCaps());
  const text = await stremioText(base, master, 20_000);
  const options: SubtitleOption[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("#EXT-X-MEDIA:") || !line.includes("TYPE=SUBTITLES")) continue;
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(line)?.[1] ?? null;
    const uri = attr("URI");
    if (!uri) continue;
    const name = attr("NAME");
    const lang = languageCode(attr("LANGUAGE")) ?? guessLanguage(name);
    const playlist = new URL(uri, master).toString();
    const index = options.length;
    options.push({
      id: `embedded:${index}`,
      label: [languageName(lang), name && name !== lang && name.toLowerCase() !== attr("LANGUAGE")?.toLowerCase() ? name : null].filter(Boolean).join(" · ") || `Track ${index + 1}`,
      lang,
      origin: "embedded",
      load: async () => {
        const list = await stremioText(base, playlist);
        const segments = list.split("\n").filter((row) => row && !row.startsWith("#"));
        const parts: string[] = [];
        for (let i = 0; i < segments.length; i += 4) {
          parts.push(...(await Promise.all(segments.slice(i, i + 4).map((row) => stremioText(base, new URL(row, playlist).toString())))));
        }
        const merged = mergeVtt(parts);
        if (!merged.includes("-->")) throw new Error("This subtitle track is empty, or made of pictures that can't be shown.");
        return merged;
      },
    });
  }
  return options;
}

function torrentOptions(source: SubtitleSource): SubtitleOption[] {
  return source.extras
    .filter((extra) => isSubtitleFileName(extra.name))
    .map((extra) => {
      const lang = guessLanguage(extra.name.replace(/\.[a-z0-9]+$/i, ""));
      return {
        id: `torrent:${extra.index}`,
        label: [languageName(lang), lang ? null : extra.name].filter(Boolean).join(" · ") || extra.name,
        lang,
        origin: "torrent" as const,
        // Stremio converts the format and works out the text encoding.
        load: async () => {
          const file = torrentFileUrl(source.base, extra.infoHash, extra.index);
          return stremioText(source.base, `${source.base}/subtitles.vtt?from=${encodeURIComponent(file)}`);
        },
      };
    });
}

export async function discoverSubtitles(source: SubtitleSource): Promise<SubtitleOption[]> {
  const [embedded, torrent] = await Promise.all([(source.embedded ? embeddedOptions(source.base, source.mediaUrl, source.master).catch(() => []) : Promise.resolve([])), Promise.resolve(torrentOptions(source))]);
  return [...embedded, ...torrent];
}

export async function subtitleFromFile(file: File): Promise<SubtitleOption> {
  if (file.size > MAX_SUBTITLE_BYTES) throw new Error("That subtitle file is too big.");
  if (!/\.(srt|vtt)$/i.test(file.name)) throw new Error("Pick an .srt or .vtt subtitle file.");
  const text = await file.text();
  const lang = guessLanguage(file.name.replace(/\.[a-z0-9]+$/i, ""));
  const vtt = /\.vtt$/i.test(file.name) ? (text.trimStart().startsWith("WEBVTT") ? text : srtToVtt(text)) : srtToVtt(text);
  if (!vtt.includes("-->")) throw new Error("That file has no subtitles in it.");
  return { id: `file:${file.name}:${file.size}`, label: file.name.replace(/\.[a-z0-9]+$/i, ""), lang, origin: "file", load: async () => vtt };
}

// Online search: Stremio's title catalogue and its OpenSubtitles add-on. Only the words searched for and the title id leave this browser.
const CATALOG = "https://v3-cinemeta.strem.io";
const SUBTITLES = "https://opensubtitles-v3.strem.io";

export interface TitleResult {
  id: string;
  name: string;
  type: "movie" | "series";
  year: string | null;
}

export async function searchTitles(query: string): Promise<TitleResult[]> {
  const text = query.trim();
  if (!text) return [];
  const kinds = ["movie", "series"] as const;
  const lists = await Promise.all(
    kinds.map(async (type) => {
      const response = await fetch(`${CATALOG}/catalog/${type}/top/search=${encodeURIComponent(text)}.json`, { credentials: "omit" }).catch(() => null);
      if (!response?.ok) return [];
      const data = (await response.json().catch(() => null)) as { metas?: { imdb_id?: string; id: string; name: string; releaseInfo?: string }[] } | null;
      return (data?.metas ?? []).slice(0, 6).map((meta) => ({ id: meta.imdb_id ?? meta.id, name: meta.name, type, year: meta.releaseInfo?.slice(0, 4) ?? null }));
    }),
  );
  return lists.flat().filter((item) => /^tt\d+$/.test(item.id));
}

interface RawSubtitle {
  id: string;
  url: string;
  lang: string;
}

export async function onlineSubtitles(title: TitleResult, episode: { season: number; episode: number } | null): Promise<SubtitleOption[]> {
  const id = title.type === "series" && episode ? `${title.id}:${episode.season}:${episode.episode}` : title.id;
  const response = await fetch(`${SUBTITLES}/subtitles/${title.type}/${id}.json`, { credentials: "omit" });
  if (!response.ok) throw new Error("The subtitle service didn't answer. Try again in a moment.");
  const data = (await response.json()) as { subtitles?: RawSubtitle[] };
  const perLanguage = new Map<string, number>();
  const options: SubtitleOption[] = [];
  for (const item of data.subtitles ?? []) {
    if (!/^https:\/\//.test(item.url)) continue;
    const lang = languageCode(item.lang);
    const count = (perLanguage.get(lang ?? "?") ?? 0) + 1;
    if (count > 5) continue;
    perLanguage.set(lang ?? "?", count);
    options.push({
      id: `online:${item.id}`,
      label: `${languageName(lang) ?? item.lang}${count > 1 ? ` · option ${count}` : ""}`,
      lang,
      origin: "online",
      load: async () => {
        const vtt = srtToVtt(await readText(await fetch(item.url, { credentials: "omit" })));
        if (!vtt.includes("-->")) throw new Error("That subtitle is empty. Try another one.");
        return vtt;
      },
    });
  }
  return options;
}
