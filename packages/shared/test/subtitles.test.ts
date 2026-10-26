import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeVtt, srtToVtt } from "../src/index.ts";

const cues = (vtt: string) => vtt.split("\n\n").slice(1).map((block) => block.trim()).filter(Boolean);

test("srtToVtt handles a BOM, CRLF and comma or dot milliseconds", () => {
  const vtt = srtToVtt("﻿1\r\n00:00:01,500 --> 00:00:02,000\r\nHello\r\n\r\n2\r\n00:00:03.250 --> 00:00:04.000\r\nWorld\r\n");
  assert.equal(vtt, "WEBVTT\n\n00:00:01.500 --> 00:00:02.000\nHello\n\n00:00:03.250 --> 00:00:04.000\nWorld\n");
});

test("srtToVtt keeps timestamps past one hour", () => {
  const vtt = srtToVtt("1\n01:02:03,004 --> 12:00:00,000\nLate");
  assert.ok(vtt.includes("01:02:03.004 --> 12:00:00.000\nLate"));
});

test("srtToVtt splits cues on whitespace-only separator lines", () => {
  const vtt = srtToVtt("1\n00:00:01,000 --> 00:00:02,000\nOne\n \n2\n00:00:03,000 --> 00:00:04,000\nTwo\n\t\n3\n00:00:05,000 --> 00:00:06,000\nThree");
  assert.deepEqual(cues(vtt).map((cue) => cue.split("\n").slice(1).join("\n")), ["One", "Two", "Three"]);
  assert.equal(mergeVtt(["00:00:01.000 --> 00:00:02.000\nA\n \n00:00:03.000 --> 00:00:04.000\nB"]).split("-->").length, 3);
});

test("srtToVtt truncates long millisecond fields instead of dropping the cue", () => {
  const vtt = srtToVtt("1\n00:00:01,12345 --> 00:00:02,98765\nHi");
  assert.ok(vtt.includes("00:00:01.123 --> 00:00:02.987\nHi"));
});

test("srtToVtt keeps a lone < in the text", () => {
  const vtt = srtToVtt("1\n00:00:01,000 --> 00:00:02,000\nI <3 you <i>so</i> much > all");
  assert.ok(vtt.includes("I &lt;3 you <i>so</i> much > all"));
});

test("srtToVtt still strips unknown tags", () => {
  const vtt = srtToVtt("1\n00:00:01,000 --> 00:00:02,000\n<font color=\"red\">Red</font> {\\an8}top");
  assert.ok(vtt.includes("\nRed top"));
});

test("srtToVtt does not let --> in the text break the cue", () => {
  const vtt = srtToVtt("1\n00:00:01,000 --> 00:00:02,000\nleft --> right");
  assert.ok(vtt.includes("\nleft -> right"));
  assert.equal(vtt.split("-->").length, 2);
});
