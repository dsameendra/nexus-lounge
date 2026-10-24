import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlaylistPage } from "../src/playlists.ts";

const page = (data: unknown) => `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
const ids = (letters: string) => Array.from(letters, (letter) => letter.repeat(11));

test("parses the newer lockup layout and skips non-video entries", () => {
  const data = {
    metadata: { playlistMetadataRenderer: { title: "Road trip" } },
    sidebar: { lockupViewModel: { contentId: "z".repeat(11), contentType: "LOCKUP_CONTENT_TYPE_VIDEO" } },
    contents: {
      list: [
        ...ids("ab").map((id, index) => ({ lockupViewModel: { contentId: id, contentType: "LOCKUP_CONTENT_TYPE_VIDEO", metadata: { lockupMetadataViewModel: { title: { content: `Song ${index}` } } } } })),
        { lockupViewModel: { contentId: "PLother", contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST" } },
      ],
    },
  };
  const result = parsePlaylistPage(page(data))!;
  assert.equal(result.title, "Road trip");
  assert.deepEqual(result.items.map((item) => item.title), ["Song 0", "Song 1"]);
});

test("parses the classic layout, drops duplicates and unplayable videos, caps the length", () => {
  const renderer = (videoId: string, extra = {}) => ({ playlistVideoRenderer: { videoId, title: { runs: [{ text: `T ${videoId[0]}` }] }, ...extra } });
  const many = Array.from({ length: 130 }, (_, index) => renderer(`v${String(index).padStart(10, "0")}`));
  const data = { contents: [renderer("a".repeat(11)), renderer("a".repeat(11)), renderer("b".repeat(11), { isPlayable: false }), ...many] };
  const result = parsePlaylistPage(page(data))!;
  assert.equal(result.items.length, 100);
  assert.equal(result.items[0]!.id, "a".repeat(11));
  assert.equal(result.title, "YouTube playlist");
});

test("returns null for pages without videos or data", () => {
  assert.equal(parsePlaylistPage("<html></html>"), null);
  assert.equal(parsePlaylistPage(page({ contents: {} })), null);
});
