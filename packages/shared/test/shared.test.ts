import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CUES,
  MAX_CUE_GAIN,
  MAX_CUE_SECONDS,
  atLiveEdge,
  cueLength,
  clientMessageSchema,
  computeCorrection,
  defaultRoomSettings,
  expectedPosition,
  isAllowedPttKey,
  isScreenId,
  isSilent,
  screenId,
  screenIdentity,
  sliderToGain,
  isTypingTarget,
  keyLabel,
  liveEdgeTarget,
  median,
  parseMediaUrl,
  parseRoomCode,
  reactionEmojiSchema,
  roomSettingsSchema,
  streamKey,
} from "../src/index.ts";
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

test("push to talk helpers", () => {
  assert.equal(keyLabel("KeyV"), "V");
  assert.equal(keyLabel("Space"), "Space");
  assert.equal(keyLabel("Digit5"), "5");
  assert.equal(keyLabel("ArrowUp"), "Up arrow");
  assert.equal(keyLabel("F9"), "F9");
  assert.equal(isTypingTarget("INPUT", false), true);
  assert.equal(isTypingTarget("div", true), true);
  assert.equal(isTypingTarget("BUTTON", false), false);
  assert.equal(isAllowedPttKey("KeyV"), true);
  assert.equal(isAllowedPttKey("Escape"), false);
  assert.equal(isAllowedPttKey(""), false);
});

test("room settings and reactions schemas", () => {
  assert.equal(roomSettingsSchema.safeParse(defaultRoomSettings).success, true);
  assert.equal(roomSettingsSchema.safeParse({ ...defaultRoomSettings, guests: "everyone" }).success, false);
  assert.equal(reactionEmojiSchema.safeParse("🔥").success, true);
  assert.equal(reactionEmojiSchema.safeParse("💩").success, false);
  assert.equal(clientMessageSchema.safeParse({ type: "settings.update", locked: true, name: "Worlds night" }).success, true);
  assert.equal(clientMessageSchema.safeParse({ type: "settings.update", guests: "nope" }).success, false);
  assert.equal(clientMessageSchema.safeParse({ type: "settings.update", name: "x".repeat(41) }).success, false);
  assert.equal(clientMessageSchema.safeParse({ type: "stream.move", streamId: "a", direction: "sideways" }).success, false);
});

test("volume curve: zero is truly silent and low values stay low", () => {
  assert.equal(sliderToGain(0), 0);
  assert.equal(sliderToGain(0.04), 0, "the bottom of the slider is silent");
  assert.equal(isSilent(0.02), true);
  assert.equal(isSilent(0.05), false);
  assert.equal(sliderToGain(1), 1);
  assert.equal(sliderToGain(0.5), 0.25);
  assert.equal(sliderToGain(7), 1, "clamped");
  assert.equal(sliderToGain(-1), 0);
  assert.equal(sliderToGain(Number.NaN), 0);
  assert.ok(sliderToGain(0.3) < 0.3, "perceptual curve is quieter than linear at low settings");
});

test("screen ids are per person", () => {
  assert.equal(screenId("discord-1"), "screen:discord-1");
  assert.equal(screenIdentity("screen:guest-ab_c"), "guest-ab_c");
  assert.equal(isScreenId("screen:123456789"), true);
  assert.equal(isScreenId("screen:"), false);
  assert.equal(isScreenId("screen:bad id"), false);
  assert.equal(isScreenId("youtube:abc"), false);
  assert.equal(isScreenId(null), false);
  assert.equal(clientMessageSchema.safeParse({ type: "presence.voice", deafened: true }).success, true);
  assert.equal(clientMessageSchema.safeParse({ type: "share.stop", userId: "x" }).success, true);
  assert.equal(roomSettingsSchema.safeParse({ ...defaultRoomSettings, sharing: "nobody" }).success, false);
});

test("sound cues are short, quiet and directional", () => {
  for (const [name, cue] of Object.entries(CUES)) {
    assert.ok(cue.gain <= MAX_CUE_GAIN, `${name} stays quiet`);
    assert.ok(cueLength(cue) <= MAX_CUE_SECONDS, `${name} stays short`);
    for (const note of cue.notes) assert.ok(note.freq >= 200 && note.freq <= 1000, `${name} avoids harsh pitches`);
  }
  const first = (name: keyof typeof CUES) => CUES[name].notes.map((note) => note.freq);
  const isDescending = (values: number[]) => values.every((value, index) => index === 0 || value < values[index - 1]!);
  const isAscending = (values: number[]) => values.every((value, index) => index === 0 || value > values[index - 1]!);
  assert.ok(isDescending(first("mute")) && isAscending(first("unmute")), "mute falls, unmute rises");
  assert.ok(isDescending(first("deafen")) && isAscending(first("undeafen")), "deafen falls, undeafen rises");
  assert.ok(isAscending(first("join")) && isDescending(first("leave")), "joining rises, leaving falls");
  assert.equal(CUES.restricted.notes.length, 2, "owner restrictions are a distinct double tone");
});

test("room codes can be typed, pasted or taken from an invite link", () => {
  assert.equal(parseRoomCode("abcd1234"), "abcd1234");
  assert.equal(parseRoomCode("  ABCD 1234 "), "abcd1234");
  assert.equal(parseRoomCode("abcd-1234"), "abcd1234");
  assert.equal(parseRoomCode("https://web-production-795645.up.railway.app/room/abcd1234"), "abcd1234");
  assert.equal(parseRoomCode("https://example.com/room/ABCD1234/tv?x=1"), "abcd1234");
  assert.equal(parseRoomCode("abcd123"), null, "too short");
  assert.equal(parseRoomCode("abcd12345"), null, "too long");
  assert.equal(parseRoomCode("https://example.com/room/abcd123"), null);
  assert.equal(parseRoomCode(""), null);
  assert.equal(parseRoomCode("hello world!"), null);
});

test("playlist links: only real playlists, on YouTube", async () => {
  const { parsePlaylistId, isQueueable } = await import("../src/index.ts");
  assert.equal(parsePlaylistId("https://www.youtube.com/playlist?list=PL6B3937A5D230E335"), "PL6B3937A5D230E335");
  assert.equal(parsePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL6B3937A5D230E335&index=2"), "PL6B3937A5D230E335");
  assert.equal(parsePlaylistId("music.youtube.com/playlist?list=OLAK5uy_abcdefghijklmnop"), "OLAK5uy_abcdefghijklmnop");
  assert.equal(parsePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ"), null, "auto-generated mixes are not playlists");
  assert.equal(parsePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parsePlaylistId("https://example.com/?list=PL6B3937A5D230E335"), null);
  assert.equal(parsePlaylistId("nonsense"), null);
  assert.equal(isQueueable({ type: "youtube", id: "dQw4w9WgXcQ", isLive: false }), true);
  assert.equal(isQueueable({ type: "twitch", id: "someone", isLive: true }), false);
});

test("TOTP matches the RFC 6238 vector and rejects reuse windows", async () => {
  const { totpCode, checkTotp, parseAdminIds, signAdminSession, verifyAdminSession } = await import("../src/admin-token.ts");
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpCode(secret, Math.floor(59 / 30)), "287082");
  assert.equal(checkTotp(secret, "287082", 59_000), 1);
  assert.equal(checkTotp(secret, "287082", 59_000 + 120_000), null);
  assert.equal(checkTotp(secret, "12345", 59_000), null);
  assert.deepEqual([...parseAdminIds(" 123456789012345678, ,abc,guest-1")], ["123456789012345678"]);
  const session = signAdminSession("123456789012345678", "a-long-admin-secret-a-long-admin-secret");
  assert.equal(verifyAdminSession(session, "a-long-admin-secret-a-long-admin-secret")?.aud, "admin-session");
  assert.equal(verifyAdminSession(session, "another-long-admin-secret-another-one"), null);
});

test("Discord users keep their Discord ID as subject; others are untouched", async () => {
  const { stableSubject } = await import("../src/identity.ts");
  assert.equal(stableSubject("uuid-1", { provider: "discord", providerAccountId: "370614114122334208" }), "370614114122334208");
  assert.equal(stableSubject("uuid-1", { provider: "discord", providerAccountId: "not-a-snowflake" }), "uuid-1");
  assert.equal(stableSubject("guest-1", { provider: "guest", providerAccountId: "370614114122334208" }), "guest-1");
  assert.equal(stableSubject("370614114122334208", null), "370614114122334208");
});

test("local files: fingerprint ranges cover the start, middle and end of big files", async () => {
  const { fingerprintRanges, FINGERPRINT_SLICE } = await import("../src/index.ts");
  assert.deepEqual(fingerprintRanges(10), [[0, 10]]);
  assert.deepEqual(fingerprintRanges(FINGERPRINT_SLICE * 3), [[0, FINGERPRINT_SLICE * 3]]);
  const size = 10 * FINGERPRINT_SLICE + 7;
  const ranges = fingerprintRanges(size);
  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges[0], [0, FINGERPRINT_SLICE]);
  assert.deepEqual(ranges[2], [size - FINGERPRINT_SLICE, size]);
  for (const [start, end] of ranges) assert.equal(end - start, FINGERPRINT_SLICE);
  assert.ok(ranges[1]![0] > ranges[0]![1] && ranges[1]![1] < ranges[2]![0]);
});

test("local files: the fingerprint is stable and sensitive to size and content", async () => {
  const { fingerprint, LOCAL_ID } = await import("../src/index.ts");
  const bytes = (length: number, fill: number) => new Uint8Array(length).fill(fill);
  const a = await fingerprint(5, [bytes(5, 1)]);
  assert.match(a, LOCAL_ID);
  assert.equal(a, await fingerprint(5, [bytes(5, 1)]));
  assert.notEqual(a, await fingerprint(5, [bytes(5, 2)]));
  assert.notEqual(await fingerprint(5, [bytes(5, 1)]), await fingerprint(6, [bytes(6, 1)]));
  const slice = 1024 * 1024;
  const size = slice * 5;
  const parts = [bytes(slice, 1), bytes(slice, 2), bytes(slice, 3)];
  const big = await fingerprint(size, parts);
  assert.notEqual(big, await fingerprint(size, [parts[0]!, bytes(slice, 9), parts[2]!]), "a different middle is a different file");
  await assert.rejects(fingerprint(size, [parts[0]!, parts[1]!]), "missing slices");
  await assert.rejects(fingerprint(size, [parts[0]!, bytes(10, 2), parts[2]!]), "short read");
});

test("local files: schemas accept real files and reject abuse", async () => {
  const { mediaSourceSchema, localFileSchema, cleanFileName, streamKey, isQueueable, clientMessageSchema } = await import("../src/index.ts");
  const id = "0123456789abcdef0123456789abcdef";
  assert.equal(mediaSourceSchema.safeParse({ type: "local", id, isLive: false }).success, true);
  assert.equal(mediaSourceSchema.safeParse({ type: "local", id, isLive: true }).success, false, "never live");
  assert.equal(mediaSourceSchema.safeParse({ type: "local", id: id.toUpperCase(), isLive: false }).success, false);
  assert.equal(mediaSourceSchema.safeParse({ type: "local", id: "short", isLive: false }).success, false);
  assert.equal(mediaSourceSchema.safeParse({ type: "youtube", id: "dQw4w9WgXcQ", isLive: false }).success, true);
  assert.equal(streamKey({ type: "local", id, isLive: false }), `local:${id}`);
  assert.equal(isQueueable({ type: "local", id, isLive: false }), false);

  assert.equal(localFileSchema.safeParse({ name: "Film.mkv", size: 1, duration: 60 }).success, true);
  for (const bad of [
    { name: "", size: 1, duration: 1 },
    { name: "a\u202eb.mp4", size: 1, duration: 1 },
    { name: "a.mp4", size: 1, duration: 1 },
    { name: "x".repeat(121), size: 1, duration: 1 },
    { name: "ok.mp4", size: 0, duration: 1 },
    { name: "ok.mp4", size: 1.5, duration: 1 },
    { name: "ok.mp4", size: 2 ** 41, duration: 1 },
    { name: "ok.mp4", size: 1, duration: -1 },
    { name: "ok.mp4", size: 1, duration: 86400 * 3 },
  ]) {
    assert.equal(localFileSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
  assert.equal(cleanFileName("  a\u202e\u200bb \n c.mp4 "), "ab c.mp4");
  assert.equal(cleanFileName("\u200b"), "Video");

  assert.equal(clientMessageSchema.safeParse({ type: "stream.add", source: { type: "local", id, isLive: false }, file: { name: "Film.mkv", size: 10, duration: 5 } }).success, true);
  assert.equal(clientMessageSchema.safeParse({ type: "presence.feed", streamId: `local:${id}` }).success, true);
  assert.equal(clientMessageSchema.safeParse({ type: "presence.feed", streamId: null }).success, true);
});
