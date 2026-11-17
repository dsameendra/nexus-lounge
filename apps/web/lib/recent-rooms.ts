// Rooms this browser actually entered, newest first. Never holds passwords or tickets.
export interface RecentRoom {
  id: string;
  name: string;
  visitedAt: number;
  startsAt: number | null;
}

interface Stored {
  user: string;
  rooms: RecentRoom[];
}

export const RECENT_ROOMS_KEY = "nexus-recent-rooms";
export const MAX_RECENT_ROOMS = 8;
const ROOM_ID = /^[a-z0-9]{8}$/;

function isRoom(value: unknown): value is RecentRoom {
  const room = value as RecentRoom;
  return (
    typeof room === "object" &&
    room !== null &&
    typeof room.id === "string" &&
    ROOM_ID.test(room.id) &&
    typeof room.name === "string" &&
    typeof room.visitedAt === "number" &&
    (room.startsAt === null || typeof room.startsAt === "number")
  );
}

// Lists belong to one account: another person signing in on this browser starts empty.
export function parseRecent(raw: string | null, user: string): RecentRoom[] {
  try {
    const stored = JSON.parse(raw ?? "null") as Stored | null;
    if (!stored || stored.user !== user || !Array.isArray(stored.rooms)) return [];
    return stored.rooms.filter(isRoom).slice(0, MAX_RECENT_ROOMS);
  } catch {
    return [];
  }
}

export function serializeRecent(user: string, rooms: RecentRoom[]) {
  return JSON.stringify({ user, rooms } satisfies Stored);
}

export function withVisit(rooms: RecentRoom[], visit: { id: string; name: string; startsAt: number | null }, now = Date.now()): RecentRoom[] {
  const entry: RecentRoom = { id: visit.id, name: visit.name.slice(0, 40), startsAt: visit.startsAt, visitedAt: now };
  return [entry, ...rooms.filter((room) => room.id !== visit.id)].slice(0, MAX_RECENT_ROOMS);
}

// A rename or new start time while inside the room: updated in place, without moving the room up again.
export function withDetails(rooms: RecentRoom[], id: string, details: { name: string; startsAt: number | null }): RecentRoom[] {
  return rooms.map((room) => (room.id === id ? { ...room, name: details.name.slice(0, 40), startsAt: details.startsAt } : room));
}

export function withoutRoom(rooms: RecentRoom[], id: string) {
  return rooms.filter((room) => room.id !== id);
}

export function loadRecent(user: string) {
  try {
    return parseRecent(localStorage.getItem(RECENT_ROOMS_KEY), user);
  } catch {
    return [];
  }
}

export function saveRecent(user: string, rooms: RecentRoom[]) {
  try {
    if (rooms.length === 0) localStorage.removeItem(RECENT_ROOMS_KEY);
    else localStorage.setItem(RECENT_ROOMS_KEY, serializeRecent(user, rooms));
  } catch {}
}

export function clearRecent() {
  try {
    localStorage.removeItem(RECENT_ROOMS_KEY);
  } catch {}
}
