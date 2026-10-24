import assert from "node:assert/strict";
import { test } from "node:test";
import { atLiveEdge, computeCorrection, expectedPosition, liveEdgeTarget, median, parseMediaUrl, streamKey } from "../src/index.ts";
import { signSessionToken, verifySessionToken } from "../src/session-token.ts";

const yt = (id: string, isLive = false) => ({ ok: true, source: { type: "youtube", id, isLive } });

test("youtube urls", () => {
  assert.deepEqual(parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"), yt("dQw4w9WgXcQ"));
  assert.deepEqual(parseMediaUrl("youtu.be/dQw4w9WgXcQ?t=5"), yt("dQw4w9WgXcQ"));
  assert.deepEqual(parseMediaUrl("https://m.youtube.com/live/dQw4w9WgXcQ"), yt("dQw4w9WgXcQ", true));
  assert.deepEqual(parseMediaUrl("https://youtube.com/shorts/dQw4w9WgXcQ"), yt("dQw4w9WgXcQ"));
  assert.deepEqual(parseMediaUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"), yt("dQw4w9WgXcQ"));
  assert.equal(parseMediaUrl("https://youtube.com/watch?v=short").ok, false);
  assert.equal(parseMediaUrl("https://youtube.com/@somechannel").ok, false);
});

test("twitch urls", () => {
  assert.deepEqual(parseMediaUrl("https://www.twitch.tv/examplechannel"), { ok: true, source: { type: "twitch", id: "examplechannel", isLive: true } });
  assert.deepEqual(parseMediaUrl("twitch.tv/ExampleChannel/"), { ok: true, source: { type: "twitch", id: "examplechannel", isLive: true } });
  assert.deepEqual(parseMediaUrl("https://www.twitch.tv/videos/2345678901?t=1h2m3s"), { ok: true, source: { type: "twitch", id: "2345678901", isLive: false } });
  assert.equal(parseMediaUrl("https://www.twitch.tv/directory").ok, false);
  assert.equal(parseMediaUrl("https://clips.twitch.tv/AbcDef").ok, false);
});

test("rejects junk", () => {
  assert.equal(parseMediaUrl("").ok, false);
  assert.equal(parseMediaUrl("hello world").ok, false);
  assert.equal(parseMediaUrl("https://vimeo.com/123").ok, false);
  assert.equal(parseMediaUrl("javascript:alert(1)").ok, false);
});

test("stream keys are stable and distinct", () => {
  assert.equal(streamKey({ type: "youtube", id: "a", isLive: true }), streamKey({ type: "youtube", id: "a", isLive: false }));
  assert.notEqual(streamKey({ type: "twitch", id: "123", isLive: true }), streamKey({ type: "twitch", id: "123", isLive: false }));
});

test("expected position", () => {
  assert.equal(expectedPosition({ position: null, playing: true, updatedAt: 0 }, 5000), null);
  assert.equal(expectedPosition({ position: 10, playing: false, updatedAt: 0 }, 5000), 10);
  assert.equal(expectedPosition({ position: 10, playing: true, updatedAt: 1000 }, 3500), 12.5);
});

test("drift correction with fine rates", () => {
  const o = { playing: true, currentRate: 1, rates: [0.95, 1.05] };
  assert.equal(computeCorrection(1.2, o).kind, "seek");
  assert.equal(computeCorrection(-1.2, o).kind, "seek");
  assert.deepEqual(computeCorrection(0.5, o), { kind: "rate", rate: 0.95 });
  assert.deepEqual(computeCorrection(-0.5, o), { kind: "rate", rate: 1.05 });
  assert.equal(computeCorrection(0.1, o).kind, "none");
  assert.equal(computeCorrection(0.1, { ...o, currentRate: 0.95 }).kind, "reset-rate");
});

test("drift correction with coarse rates prefers speeding up over seeking", () => {
  const o = { playing: true, currentRate: 1, rates: [0.75, 1.25] };
  assert.equal(computeCorrection(0.4, o).kind, "none");
  assert.deepEqual(computeCorrection(0.8, o), { kind: "rate", rate: 0.75 });
  assert.deepEqual(computeCorrection(-2, o), { kind: "rate", rate: 1.25 });
  assert.equal(computeCorrection(2.6, o).kind, "seek");
  assert.equal(computeCorrection(0.2, { ...o, currentRate: 1.25 }).kind, "reset-rate");
  assert.deepEqual(computeCorrection(-0.5, { ...o, currentRate: 1.25 }), { kind: "rate", rate: 1.25 });
});

test("drift correction without rate control only seeks when far off", () => {
  const o = { playing: true, currentRate: 1, rates: [] };
  assert.equal(computeCorrection(1.0, o).kind, "none");
  assert.equal(computeCorrection(-1.4, o).kind, "none");
  assert.equal(computeCorrection(1.6, o).kind, "seek");
});

test("paused drift", () => {
  const o = { playing: false, currentRate: 1, rates: [0.95, 1.05] };
  assert.equal(computeCorrection(0.5, o).kind, "none");
  assert.equal(computeCorrection(0.8, o).kind, "seek");
});

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});

test("session tokens", () => {
  const user = { sub: "u1", name: "A", image: null, guest: false };
  const token = signSessionToken(user, "secret-secret-secret", 60);
  assert.equal(verifySessionToken(token, "secret-secret-secret")?.sub, "u1");
  assert.equal(verifySessionToken(token, "other-secret-secret"), null);
  assert.equal(verifySessionToken(signSessionToken(user, "secret-secret-secret", -5), "secret-secret-secret"), null);
  assert.equal(verifySessionToken(`${token}x`, "secret-secret-secret"), null);
});

test("live edge helpers", () => {
  assert.equal(liveEdgeTarget(1000), 997);
  assert.equal(liveEdgeTarget(2), 0);
  assert.equal(atLiveEdge(995, 1000), true);
  assert.equal(atLiveEdge(900, 1000), false);
  assert.equal(atLiveEdge(0, 0), false);
});
