import assert from "node:assert/strict";
import { test } from "node:test";
import { fromLocalInput, inviteText, startsIn, toLocalInput, upcoming } from "../lib/schedule.ts";

const NOW = Date.UTC(2026, 10, 17, 12, 0);
const MINUTE = 60_000;

test("the invite is the link, plus Discord timestamps when a start time is ahead", () => {
  const link = "https://nexuslounge.party/room/abcd1234";
  assert.equal(inviteText(link, null, NOW), link);
  assert.equal(inviteText(link, NOW - MINUTE, NOW), link, "a past start time is left out");
  const startsAt = NOW + 90 * MINUTE + 500;
  const seconds = Math.floor(startsAt / 1000);
  assert.equal(inviteText(link, startsAt, NOW), `${link}\nStarts <t:${seconds}:F> (<t:${seconds}:R>)`);
});

test("datetime-local values round-trip through local time", () => {
  const epoch = fromLocalInput("2026-12-24T19:30");
  assert.ok(epoch);
  const date = new Date(epoch);
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()], [2026, 11, 24, 19, 30]);
  assert.equal(toLocalInput(epoch), "2026-12-24T19:30");
  assert.equal(fromLocalInput(""), null);
  assert.equal(fromLocalInput("2026-12-24"), null);
});

test("datetime-local is local wall time in another zone too", async () => {
  const { spawnSync } = await import("node:child_process");
  const script = `import { fromLocalInput, toLocalInput } from ${JSON.stringify(new URL("../lib/schedule.ts", import.meta.url).href)};
    const epoch = fromLocalInput("2026-07-01T09:00");
    console.log(JSON.stringify([epoch, toLocalInput(epoch)]));`;
  const run = (tz: string) => {
    const result = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
    return JSON.parse(result.stdout) as [number, string];
  };
  const [tokyo, tokyoBack] = run("Asia/Tokyo");
  const [newYork, newYorkBack] = run("America/New_York");
  assert.equal(tokyo, Date.UTC(2026, 6, 1, 0, 0), "09:00 in Tokyo is 00:00 UTC");
  assert.equal(newYork, Date.UTC(2026, 6, 1, 13, 0), "09:00 in New York (EDT) is 13:00 UTC");
  assert.equal(tokyoBack, "2026-07-01T09:00");
  assert.equal(newYorkBack, "2026-07-01T09:00");
});

test("relative wording", () => {
  assert.equal(upcoming(null, NOW), false);
  assert.equal(upcoming(NOW, NOW), false);
  assert.equal(upcoming(NOW + 1, NOW), true);
  assert.equal(startsIn(NOW + 20_000, NOW), "Starts in under a minute");
  assert.equal(startsIn(NOW + 25 * MINUTE, NOW), "Starts in 25 min");
  assert.equal(startsIn(NOW + 60 * MINUTE, NOW), "Starts in 1 hour");
  assert.equal(startsIn(NOW + 5 * 60 * MINUTE, NOW), "Starts in 5 hours");
  assert.equal(startsIn(NOW + 3 * 24 * 60 * MINUTE, NOW), "Starts in 3 days");
});
