import assert from "node:assert/strict";
import { test } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";

process.env.AUTH_SECRET = "test-secret-test-secret-123456";
process.env.LIVEKIT_URL = "ws://x";
process.env.LIVEKIT_API_KEY = "key";
process.env.LIVEKIT_API_SECRET = "livekit-secret-livekit-secret-1234";

const { allowFeedSource, createLivekitToken, grantFor } = await import("../src/livekit.ts");
const { TrackSource } = await import("livekit-server-sdk");

const user = { sub: "alice", name: "Alice", image: null, guest: false };
const none = { guest: false, micBlocked: false, canShare: false, canFeed: false };
const sources = async (inputs: typeof none, who = user) => {
  const jwt = await createLivekitToken("room1234", who, inputs);
  const claims = await new TokenVerifier("key", "livekit-secret-livekit-secret-1234").verify(jwt);
  return { jwt, publish: claims.video?.canPublish, sources: claims.video?.canPublishSources as unknown as string[] };
};

test("feed tracks are a separate grant that only owners of a local file get", async () => {
  assert.deepEqual(grantFor(none).canPublishSources, [TrackSource.MICROPHONE]);
  assert.deepEqual(grantFor({ ...none, canShare: true }).canPublishSources, [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]);
  assert.deepEqual(grantFor({ ...none, canFeed: true }).canPublishSources, [TrackSource.MICROPHONE, TrackSource.UNKNOWN]);
  assert.equal(grantFor({ guest: true, micBlocked: false, canShare: true, canFeed: true }).canPublishSources.includes(TrackSource.UNKNOWN), false, "guests never");
  assert.deepEqual(grantFor({ ...none, micBlocked: true, canFeed: true }).canPublishSources, [TrackSource.UNKNOWN]);
  assert.deepEqual(grantFor({ ...none, micBlocked: true }), { canPublish: false, canPublishSources: [] });
});

test("the signed LiveKit token carries the feed source only when granted", async () => {
  assert.deepEqual((await sources(none)).sources, ["microphone"]);
  const fed = await sources({ ...none, canShare: true, canFeed: true });
  assert.deepEqual(fed.sources, ["microphone", "screen_share", "screen_share_audio", "unknown"]);
  assert.equal(fed.publish, true);
  const only = await sources({ ...none, micBlocked: true, canFeed: true });
  assert.deepEqual(only.sources, ["unknown"]);
  assert.equal(only.publish, true);
  const guest = await sources({ guest: true, micBlocked: false, canShare: true, canFeed: true }, { ...user, guest: true });
  assert.deepEqual(guest.sources, ["microphone"]);
});

test("a patched token still has to be signed with the real secret", async () => {
  const { jwt } = await sources({ ...none, canFeed: false });
  const forged = allowFeedSource(jwt, "some-other-secret-some-other-secret");
  await assert.rejects(new TokenVerifier("key", "livekit-secret-livekit-secret-1234").verify(forged));
  assert.equal(allowFeedSource("a.e30.c", "x"), "a.e30.c", "tokens without a video grant are left alone");
});
