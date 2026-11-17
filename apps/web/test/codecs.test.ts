import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { browserCaps, directPlayable, isApple } from "../lib/codecs.ts";
import type { Probe } from "../lib/stremio.ts";
import { stubGlobal } from "./globals.ts";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

let restores: (() => void)[] = [];
afterEach(() => {
  restores.reverse().forEach((restore) => restore());
  restores = [];
});

// A browser whose decoder takes the given codec strings, through Media Source and through <video>.canPlayType.
function browser({ userAgent = CHROME, mse = [] as string[], video = [] as string[], matroska = false }) {
  const asked: string[] = [];
  const answers = (list: string[], type: string) => list.some((codec) => type.includes(`"${codec}"`));
  restores.push(
    stubGlobal("navigator", { userAgent }),
    stubGlobal("MediaSource", {
      isTypeSupported: (type: string) => {
        asked.push(`mse ${type}`);
        return answers(mse, type);
      },
    }),
    stubGlobal("document", {
      createElement: () => ({
        canPlayType: (type: string) => {
          asked.push(`video ${type}`);
          if (type.startsWith("video/x-matroska")) return matroska ? "maybe" : "";
          return answers(video, type) ? "probably" : "";
        },
      }),
    }),
  );
  return asked;
}

const probe = (container: string, video: string | null, audio: string | null): Probe => ({ container, duration: 600, video, audio, subtitleTracks: 0 });

test("H.264 and AAC are always offered", () => {
  browser({});
  assert.deepEqual(browserCaps(), { video: ["h264"], audio: ["aac"] });
});

test("other codecs are offered when the decoder takes them", () => {
  browser({ mse: ["hvc1.1.6.L120.B0", "vp09.00.10.08", "opus", "ec-3"] });
  assert.deepEqual(browserCaps(), { video: ["h264", "hevc", "vp9"], audio: ["aac", "opus", "eac3"] });
});

test("Safari is asked through <video>, not Media Source", () => {
  const asked = browser({ userAgent: SAFARI, mse: ["hvc1.1.6.L120.B0"], video: ["ac-3"] });
  assert.equal(isApple(), true);
  assert.deepEqual(browserCaps(), { video: ["h264"], audio: ["aac", "ac3"] });
  assert.ok(asked.every((entry) => entry.startsWith("video ")));
});

test("Chrome is not mistaken for Safari", () => {
  browser({});
  assert.equal(isApple(), false);
});

test("MP4 plays directly when both codecs decode", () => {
  browser({ mse: ["hvc1.1.6.L120.B0"] });
  assert.equal(directPlayable(probe("mov,mp4,m4a,3gp,3g2,mj2", "h264", "aac")), true);
  assert.equal(directPlayable(probe("mov,mp4,m4a,3gp,3g2,mj2", "hevc", "aac")), true);
  assert.equal(directPlayable(probe("mov,mp4,m4a,3gp,3g2,mj2", null, "aac")), true);
});

test("MP4 needs converting when a codec doesn't decode", () => {
  browser({});
  assert.equal(directPlayable(probe("mov,mp4,m4a,3gp,3g2,mj2", "hevc", "aac")), false);
  assert.equal(directPlayable(probe("mov,mp4,m4a,3gp,3g2,mj2", "h264", "ac3")), false);
  assert.equal(directPlayable(probe("mov,mp4,m4a,3gp,3g2,mj2", "mpeg4", "aac")), false);
});

test("WebM codecs play directly from a matroska,webm probe", () => {
  browser({ mse: ["vp09.00.10.08", "opus"] });
  assert.equal(directPlayable(probe("matroska,webm", "vp9", "opus")), true);
  assert.equal(directPlayable(probe("matroska,webm", "vp8", "vorbis")), true);
});

test("Matroska plays directly only where the browser has a demuxer", () => {
  browser({ matroska: true });
  assert.equal(directPlayable(probe("matroska,webm", "h264", "aac")), true);
  browser({ matroska: false });
  assert.equal(directPlayable(probe("matroska,webm", "h264", "aac")), false);
});

test("Matroska with a codec we have no name for needs converting", () => {
  browser({ matroska: true });
  assert.equal(directPlayable(probe("matroska,webm", "mpeg4", "aac")), false);
  assert.equal(directPlayable(probe("matroska,webm", "h264", "dts")), false);
});

test("other containers always need converting", () => {
  browser({ matroska: true, mse: ["hvc1.1.6.L120.B0"] });
  assert.equal(directPlayable(probe("avi", "h264", "mp3")), false);
  assert.equal(directPlayable(probe("mpegts", "h264", "aac")), false);
});
