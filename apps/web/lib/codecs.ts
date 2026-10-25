import type { Probe } from "./stremio";

function video() {
  return document.createElement("video");
}

export const isApple = () => typeof navigator !== "undefined" && /^((?!chrome|chromium|android|firefox|edg).)*safari/i.test(navigator.userAgent);

// What this browser can decode, in the names Stremio's transcoder uses.
export function browserCaps() {
  const element = video();
  const can = (type: string) => element.canPlayType(type) !== "";
  const videoCodecs = ["h264"];
  if (can('video/webm; codecs="vp9"')) videoCodecs.push("vp9");
  if (can('video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push("av1");
  if (isApple() && can('video/mp4; codecs="hvc1.1.6.L93.B0"')) videoCodecs.push("hevc");
  const audioCodecs = ["aac"];
  if (can("audio/mpeg")) audioCodecs.push("mp3");
  if (can('audio/webm; codecs="opus"')) audioCodecs.push("opus");
  if (isApple() && can('audio/mp4; codecs="ac-3"')) audioCodecs.push("ac3");
  if (isApple() && can('audio/mp4; codecs="ec-3"')) audioCodecs.push("eac3");
  return { video: videoCodecs, audio: audioCodecs };
}

// true: plays straight in a <video>. false: needs converting (or another container). Matroska with H.264 is false
// on purpose: Chrome plays it, Firefox and Safari don't, and Stremio can make it work everywhere.
export function directPlayable(probe: Probe) {
  const caps = browserCaps();
  const name = probe.container.toLowerCase();
  const videoOk = probe.video === null || caps.video.includes(probe.video) || probe.video === "vp8";
  const audioOk = probe.audio === null || caps.audio.includes(probe.audio) || probe.audio === "vorbis";
  if (!videoOk || !audioOk) return false;
  if (name.includes("mp4")) return probe.video === null || ["h264", "vp9", "av1", "hevc"].includes(probe.video);
  if (name.includes("webm")) return probe.video === null || ["vp8", "vp9", "av1"].includes(probe.video);
  return false;
}
