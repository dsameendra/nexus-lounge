export const MAX_SUBTITLE_BYTES = 2_000_000;

const TEXT_CODECS = new Set(["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text", "subviewer", "microdvd"]);

// Picture-based subtitles (Blu-ray, DVD) can't be shown as text.
export const isTextSubtitleCodec = (codec: string | null | undefined) => Boolean(codec && TEXT_CODECS.has(codec.toLowerCase()));

const TIMING = /(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function stamp(hours: string | undefined, minutes: string, seconds: string, millis: string) {
  const h = String(Number(hours?.replace(":", "") ?? 0)).padStart(2, "0");
  return `${h}:${minutes.padStart(2, "0")}:${seconds}.${millis.padEnd(3, "0")}`;
}

// SubRip (or WebVTT) text to WebVTT. Style tags from ASS-in-SRT files are dropped; <i>, <b> and <u> stay.
export function srtToVtt(input: string) {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "WEBVTT\n";
  const blocks: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => TIMING.test(line));
    if (at === -1) continue;
    const m = TIMING.exec(lines[at]!)!;
    const body = lines
      .slice(at + 1)
      .join("\n")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/<(?!\/?[ibu]>)[^>]*>/gi, "")
      .replace(/&(?!(amp|lt|gt|nbsp|lrm|rlm);)/g, "&amp;")
      .trim();
    if (!body) continue;
    blocks.push(`${stamp(m[1], m[2]!, m[3]!, m[4]!)} --> ${stamp(m[5], m[6]!, m[7]!, m[8]!)}\n${body}`);
  }
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

// Joins the WebVTT segments of an HLS subtitle playlist into one file, dropping repeats at segment edges.
export function mergeVtt(segments: string[]) {
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const segment of segments) {
    for (const block of segment.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
      if (!TIMING.test(block) || seen.has(block.trim())) continue;
      seen.add(block.trim());
      blocks.push(block.trim());
    }
  }
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

export function isSubtitleFileName(name: string) {
  return /\.(srt|vtt|ass|ssa)$/i.test(name);
}

const LANGUAGE_WORDS: Record<string, string> = {
  english: "en", eng: "en", en: "en", spanish: "es", spa: "es", es: "es", french: "fr", fre: "fr", fra: "fr", fr: "fr", german: "de", ger: "de", deu: "de", de: "de",
  italian: "it", ita: "it", it: "it", portuguese: "pt", por: "pt", pt: "pt", dutch: "nl", dut: "nl", nld: "nl", nl: "nl", polish: "pl", pol: "pl", pl: "pl",
  russian: "ru", rus: "ru", ru: "ru", japanese: "ja", jpn: "ja", ja: "ja", korean: "ko", kor: "ko", ko: "ko", chinese: "zh", chi: "zh", zho: "zh", zh: "zh",
  arabic: "ar", ara: "ar", ar: "ar", turkish: "tr", tur: "tr", tr: "tr", swedish: "sv", swe: "sv", sv: "sv", hindi: "hi", hin: "hi", hi: "hi", sinhala: "si", sin: "si", si: "si", tamil: "ta", tam: "ta", ta: "ta",
};

// A best guess at the language of a subtitle from its name or tag ("Movie.en.srt", "eng", "Spanish"), as a two-letter code.
export function guessLanguage(text: string | null | undefined) {
  if (!text) return null;
  for (const word of text.toLowerCase().split(/[^a-z]+/).reverse()) {
    const code = LANGUAGE_WORDS[word];
    if (code) return code;
  }
  return null;
}

const THREE_TO_TWO: Record<string, string> = { eng: "en", spa: "es", fre: "fr", fra: "fr", ger: "de", deu: "de", ita: "it", por: "pt", pob: "pt", dut: "nl", nld: "nl", pol: "pl", rus: "ru", jpn: "ja", kor: "ko", chi: "zh", zho: "zh", ara: "ar", tur: "tr", swe: "sv", hin: "hi", sin: "si", tam: "ta" };

// "eng" and "en-US" both become "en"; unknown three-letter codes are kept.
export function languageCode(code: string | null | undefined) {
  if (!code) return null;
  const lower = code.toLowerCase();
  return THREE_TO_TWO[lower] ?? lower.split("-")[0]!;
}
