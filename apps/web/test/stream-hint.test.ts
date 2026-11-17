import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntrySource, LocalEntry } from "../lib/local-entry.ts";
import { streamHint } from "../lib/stream-hint.ts";
import type { StremioLimits, TorrentStats } from "../lib/stremio.ts";

const NOW = 1_000_000;
const TORRENT = { base: "http://127.0.0.1:11470", infoHash: "abc", fileIdx: 0 };

function entry({ source = { kind: "url", url: "https://x.test/v.mp4", hls: false } as EntrySource, stalls = 3, recentStallAt = NOW - 1000 } = {}) {
  return { source, perf: { openedMs: 100, firstFrameMs: 200, stalls, recentStallAt, fellBack: 0 } } as unknown as LocalEntry;
}
const torrent = (hls = false): EntrySource => ({ kind: "url", url: "http://127.0.0.1:11470/abc/0", hls, torrent: TORRENT });
const stats = (speed: number, peers: number): TorrentStats => ({ progress: 0.1, speed, peers });
const limits = (downloadLimit: number, hardwareAccel: boolean | null = null): StremioLimits => ({ downloadLimit, hardwareAccel });

test("nothing to say without a playing link or torrent", () => {
  assert.equal(streamHint(null, null, null, NOW), null);
  assert.equal(streamHint(entry({ source: { kind: "file", file: {} as File } }), stats(0, 0), limits(0, false), NOW), null);
});

test("nothing is said before repeated, recent stalls", () => {
  assert.equal(streamHint(entry({ source: torrent(), stalls: 1 }), stats(0, 0), null, NOW), null);
  assert.equal(streamHint(entry({ source: torrent(), recentStallAt: NOW - 61_000 }), stats(0, 0), null, NOW), null);
  assert.match(streamHint(entry({ source: torrent(), recentStallAt: NOW - 59_000 }), stats(0, 0), null, NOW) ?? "", /Nobody is sending/);
});

test("Stremio's download limit is blamed when the torrent runs at it", () => {
  const hint = streamHint(entry({ source: torrent() }), stats(1_900_000, 12), limits(2_000_000), NOW);
  assert.match(hint ?? "", /holding downloads to 2\.0 MB\/s/);
});

test("a torrent without peers, or a slow one, says so", () => {
  assert.match(streamHint(entry({ source: torrent() }), stats(0, 0), limits(0), NOW) ?? "", /Nobody is sending/);
  assert.match(streamHint(entry({ source: torrent() }), stats(250_000, 1), null, NOW) ?? "", /slow \(250 KB\/s from 1 peer\)/);
  assert.match(streamHint(entry({ source: torrent() }), stats(120_000, 4), null, NOW) ?? "", /from 4 peers/);
});

test("a fast torrent says nothing about the download", () => {
  assert.equal(streamHint(entry({ source: torrent() }), stats(5_000_000, 30), limits(0, true), NOW), null);
});

test("conversion on the processor is blamed only for playlists", () => {
  assert.match(streamHint(entry({ source: torrent(true) }), stats(5_000_000, 30), limits(0, false), NOW) ?? "", /hardware acceleration/);
  assert.equal(streamHint(entry({ source: torrent(false) }), stats(5_000_000, 30), limits(0, false), NOW), null);
  assert.equal(streamHint(entry({ source: torrent(true) }), stats(5_000_000, 30), limits(0, null), NOW), null);
});

test("a link without torrent stats can still be blamed on conversion", () => {
  const source: EntrySource = { kind: "url", url: "http://127.0.0.1:11470/hlsv2/x/master.m3u8", hls: true };
  assert.match(streamHint(entry({ source }), null, limits(0, false), NOW) ?? "", /hardware acceleration/);
  assert.equal(streamHint(entry({ source }), null, null, NOW), null);
});
