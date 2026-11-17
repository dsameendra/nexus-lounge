import assert from "node:assert/strict";
import { test } from "node:test";
import { appendChat, cleanChatText, mergeChat, type ChatLine } from "../src/chat.ts";

const line = (id: string, at: number): ChatLine => ({ id, from: { id: "a", name: "A" }, text: id, at });

test("cleanChatText trims, strips invisible characters and bounds the length", () => {
  assert.equal(cleanChatText("  hi​\u0000 there ‮ "), "hi there");
  assert.equal(cleanChatText(" ​﻿ "), null);
  assert.equal(cleanChatText("x".repeat(500)), "x".repeat(500));
  assert.equal(cleanChatText("x".repeat(501)), null);
  assert.equal(cleanChatText(`${"x".repeat(500)}​​`), "x".repeat(500), "invisible padding doesn't count");
  assert.equal(cleanChatText("emoji 👋 stays"), "emoji 👋 stays");
});

test("appendChat keeps the newest lines", () => {
  const lines = Array.from({ length: 100 }, (_, index) => line(String(index), index));
  const next = appendChat(lines, line("new", 100));
  assert.equal(next.length, 100);
  assert.equal(next[0]!.id, "1");
  assert.equal(next[99]!.id, "new");
});

test("mergeChat dedupes by id, sorts by time and keeps the same array when nothing is new", () => {
  const current = [line("a", 1), line("b", 2)];
  assert.equal(mergeChat(current, [line("a", 1), line("b", 2)]), current, "a reconnect with the same history changes nothing");
  assert.deepEqual(mergeChat(current, [line("a", 1), line("c", 3), line("b", 2)]).map((entry) => entry.id), ["a", "b", "c"]);
  assert.deepEqual(mergeChat([line("c", 3)], [line("a", 1), line("b", 2), line("c", 3)]).map((entry) => entry.id), ["a", "b", "c"], "history arriving after a live line slots in before it");
  assert.deepEqual(mergeChat([line("a", 1)], [line("b", 2), line("c", 3)], 2).map((entry) => entry.id), ["b", "c"]);
});
