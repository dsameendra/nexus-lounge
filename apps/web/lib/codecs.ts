import type { Probe } from "./stremio";

function video() {
  return document.createElement("video");
}

export const isApple = () => typeof navigator !== "undefined" && /^((?!chrome|chromium|android|firefox|edg).)*safari/i.test(navigator.userAgent);

// Codec names as Stremio's probe and transcoder use them, and the codec strings browsers understand.
const VIDEO_TYPES: Record<string, string> = { h264: "avc1.64002a", hevc: "hvc1.1.6.L120.B0", vp9: "vp09.00.10.08", av1: "av01.0.08M.08" };
const AUDIO_TYPES: Record<string, string> = { aac: "mp4a.40.2", mp3: "mp3", opus: "opus", ac3: "ac-3", eac3: "ec-3" };

// Ask the decoder, not the user agent: the same Chrome plays HEVC on one computer and not on another. Playlists play
// through Media Source (hls.js) except on Safari, which plays them natively, so each path asks its own question.
function can(container: string, codec: string) {
  const type = `${container}; codecs="${codec}"`;
  const source = typeof MediaSource !== "undefined" ? MediaSource : null;
  if (source && !isApple() && container !== "video/x-matroska") return source.isTypeSupported(type);
  return video().canPlayType(type) !== "";
}

// What this browser can decode, in the names Stremio's transcoder uses.
export function browserCaps() {
  const videoCodecs = Object.keys(VIDEO_TYPES).filter((name) => name === "h264" || can("video/mp4", VIDEO_TYPES[name]!));
  const audioCodecs = Object.keys(AUDIO_TYPES).filter((name) => name === "aac" || can("audio/mp4", AUDIO_TYPES[name]!));
  return { video: videoCodecs, audio: audioCodecs };
}

// What every browser takes: the last resort when a playlist that copies fancier codecs doesn't play.
export const SAFE_CAPS = { video: ["h264"], audio: ["aac"] };

function matroskaPlays(videoCodec: string | null, audioCodec: string | null) {
  const picked = [videoCodec === null ? null : VIDEO_TYPES[videoCodec], audioCodec === null ? null : AUDIO_TYPES[audioCodec]];
  if ((videoCodec !== null && !picked[0]) || (audioCodec !== null && !picked[1])) return false;
  return video().canPlayType(`video/x-matroska; codecs="${picked.filter(Boolean).join(",")}"`) !== "";
}

// true: plays straight in a <video>. false: needs converting (or another container). Matroska plays directly where the
// browser has a Matroska demuxer (Chrome and Edge; Firefox and Safari have none), which skips the converter entirely.
export function directPlayable(probe: Probe) {
  const caps = browserCaps();
  const name = probe.container.toLowerCase();
  const videoOk = probe.video === null || caps.video.includes(probe.video) || probe.video === "vp8";
  const audioOk = probe.audio === null || caps.audio.includes(probe.audio) || probe.audio === "vorbis";
  if (name.includes("mp4")) return videoOk && audioOk && (probe.video === null || ["h264", "vp9", "av1", "hevc"].includes(probe.video));
  // Matroska and WebM share one demuxer, so a "matroska,webm" probe may be either: VP8/VP9/AV1 plays as WebM, the rest needs Matroska.
  if (name.includes("webm") && videoOk && audioOk && (probe.video === null || ["vp8", "vp9", "av1"].includes(probe.video))) return true;
  if (name.includes("matroska")) return matroskaPlays(probe.video, probe.audio);
  return false;
}
