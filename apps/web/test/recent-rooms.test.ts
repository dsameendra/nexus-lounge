import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MAX_RECENT_ROOMS, RECENT_ROOMS_KEY, clearRecent, loadRecent, parseRecent, saveRecent, serializeRecent, withDetails, withVisit, withoutRoom } from "../lib/recent-rooms.ts";
import { stubGlobal } from "./globals.ts";

const visit = (id: string, name = "") => ({ id, name, startsAt: null });
const ids = (rooms: { id: string }[]) => rooms.map((room) => room.id);

test("visits go to the top, without duplicates, capped", () => {
  let rooms = withVisit([], visit("aaaaaaaa", "A"), 1);
  rooms = withVisit(rooms, visit("bbbbbbbb", "B"), 2);
  rooms = withVisit(rooms, visit("aaaaaaaa", "A again"), 3);
  assert.deepEqual(ids(rooms), ["aaaaaaaa", "bbbbbbbb"]);
  assert.deepEqual(rooms[0], { id: "aaaaaaaa", name: "A again", startsAt: null, visitedAt: 3 });

  for (let i = 0; i < 20; i++) rooms = withVisit(rooms, visit(`room${String(i).padStart(4, "0")}`), 10 + i);
  assert.equal(rooms.length, MAX_RECENT_ROOMS);
  assert.equal(rooms[0]!.id, "room0019", "newest first");
});

test("details update in place; removal drops one room", () => {
  const rooms = [withVisit([], visit("aaaaaaaa", "A"), 1)[0]!, withVisit([], visit("bbbbbbbb", "B"), 2)[0]!];
  const renamed = withDetails(rooms, "bbbbbbbb", { name: "Movie night", startsAt: 99 });
  assert.deepEqual(ids(renamed), ["aaaaaaaa", "bbbbbbbb"], "order is kept");
  assert.equal(renamed[1]!.name, "Movie night");
  assert.equal(renamed[1]!.startsAt, 99);
  assert.equal(renamed[1]!.visitedAt, 2);
  assert.deepEqual(ids(withoutRoom(renamed, "aaaaaaaa")), ["bbbbbbbb"]);
});

test("stored lists belong to one account and bad data is ignored", () => {
  const rooms = withVisit([], visit("aaaaaaaa", "A"), 1);
  const raw = serializeRecent("discord-1", rooms);
  assert.deepEqual(parseRecent(raw, "discord-1"), rooms);
  assert.deepEqual(parseRecent(raw, "discord-2"), [], "another person on this browser sees nothing");
  assert.deepEqual(parseRecent("{nope", "discord-1"), []);
  assert.deepEqual(parseRecent(null, "discord-1"), []);
  const tampered = JSON.stringify({ user: "discord-1", rooms: [{ id: "../evil", name: "x", visitedAt: 1, startsAt: null }, rooms[0], { id: "cccccccc" }] });
  assert.deepEqual(ids(parseRecent(tampered, "discord-1")), ["aaaaaaaa"], "only well-formed room entries survive");
});

let restore = () => {};
afterEach(() => restore());

test("storage wrappers survive a browser that throws, and clearing removes the key", () => {
  const data = new Map<string, string>();
  restore = stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  saveRecent("u", withVisit([], visit("aaaaaaaa"), 1));
  assert.deepEqual(ids(loadRecent("u")), ["aaaaaaaa"]);
  assert.ok(!data.get(RECENT_ROOMS_KEY)!.includes("password"));
  clearRecent();
  assert.equal(data.has(RECENT_ROOMS_KEY), false);
  restore();

  const boom = () => {
    throw new Error("blocked");
  };
  restore = stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
  assert.deepEqual(loadRecent("u"), []);
  saveRecent("u", []);
  clearRecent();
});
