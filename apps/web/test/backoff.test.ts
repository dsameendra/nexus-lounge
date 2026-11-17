import assert from "node:assert/strict";
import { test } from "node:test";
import { reconnectDelay } from "../lib/backoff.ts";

test("the first retry waits between 200 and 400 ms", () => {
  assert.equal(reconnectDelay(0, () => 0), 200);
  assert.equal(reconnectDelay(0, () => 1), 400);
  assert.equal(reconnectDelay(0, () => 0.5), 300);
});

test("the delay doubles per attempt", () => {
  assert.equal(reconnectDelay(1, () => 1), 800);
  assert.equal(reconnectDelay(2, () => 1), 1600);
  assert.equal(reconnectDelay(3, () => 1), 3200);
});

test("the delay is capped at 5 s and never drops below half of the cap", () => {
  for (const attempt of [4, 5, 10, 50, 1000]) {
    assert.equal(reconnectDelay(attempt, () => 1), 5000);
    assert.equal(reconnectDelay(attempt, () => 0), 2500);
  }
});

test("a negative attempt counts as the first", () => {
  assert.equal(reconnectDelay(-3, () => 1), 400);
});

test("with real randomness the delay stays in range and varies", () => {
  const delays = Array.from({ length: 200 }, () => reconnectDelay(6));
  assert.ok(delays.every((delay) => delay >= 2500 && delay <= 5000));
  assert.ok(new Set(delays).size > 1);
});
