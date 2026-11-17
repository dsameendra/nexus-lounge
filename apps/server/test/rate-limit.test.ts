import assert from "node:assert/strict";
import { test } from "node:test";
import { allowAttempt } from "../src/rate-limit.ts";

test("allowAttempt allows up to the limit per key and window", async () => {
  for (let i = 0; i < 3; i++) assert.equal(allowAttempt("a", 3, 100), true);
  assert.equal(allowAttempt("a", 3, 100), false);
  assert.equal(allowAttempt("b", 3, 100), true, "keys are independent");
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(allowAttempt("a", 3, 100), true, "a new window starts after the old one ends");
});

test("allowAttempt defaults to 12 per minute", () => {
  for (let i = 0; i < 12; i++) assert.equal(allowAttempt("default"), true);
  assert.equal(allowAttempt("default"), false);
});

test("allowAttempt keeps counting live keys while pruning expired ones", async () => {
  for (let i = 0; i < 5001; i++) allowAttempt(`old:${i}`, 1, 10);
  allowAttempt("live", 1, 60_000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(allowAttempt("trigger-prune"), true);
  assert.equal(allowAttempt("live", 1, 60_000), false, "a pruned table still remembers unexpired keys");
});
