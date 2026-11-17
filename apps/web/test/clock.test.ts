import assert from "node:assert/strict";
import { test } from "node:test";
import { ClockSync } from "../lib/clock.ts";

test("it is ready after three samples", () => {
  const clock = new ClockSync();
  clock.addSample(0, 1050, 100);
  clock.addSample(0, 1050, 100);
  assert.equal(clock.ready, false);
  clock.addSample(0, 1050, 100);
  assert.equal(clock.ready, true);
});

test("the offset assumes the server answered halfway through the round trip", () => {
  const clock = new ClockSync();
  clock.addSample(1000, 6050, 1100);
  assert.equal(clock.offset, 5000);
  const before = Date.now();
  const now = clock.now();
  assert.ok(now >= before + 5000 && now <= Date.now() + 5000);
});

test("slow round trips don't pull the offset", () => {
  const clock = new ClockSync();
  for (let i = 0; i < 4; i++) clock.addSample(0, 100 + 10, 20);
  clock.addSample(0, 4000, 3000);
  clock.addSample(0, 3000, 2000);
  assert.equal(clock.offset, 100);
});

test("impossible round trips are ignored", () => {
  const clock = new ClockSync();
  clock.addSample(100, 500, 50);
  clock.addSample(0, 500, 5001);
  assert.equal(clock.ready, false);
  assert.equal(clock.offset, 0);
});

test("only the latest samples count", () => {
  const clock = new ClockSync();
  for (let i = 0; i < 16; i++) clock.addSample(0, 1010, 20);
  for (let i = 0; i < 16; i++) clock.addSample(0, 2010, 20);
  assert.equal(clock.offset, 2000);
});

test("reset forgets everything", () => {
  const clock = new ClockSync();
  for (let i = 0; i < 3; i++) clock.addSample(0, 1010, 20);
  clock.reset();
  assert.equal(clock.ready, false);
  assert.equal(clock.offset, 0);
});
