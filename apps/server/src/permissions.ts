import { applyPermissions } from "./livekit.ts";
import * as rooms from "./rooms.ts";

export function syncPermissions(roomId: string, user: { sub: string; guest: boolean }) {
  return applyPermissions(roomId, user.sub, rooms.publishInputs(roomId, user));
}

export function syncAllPermissions(roomId: string) {
  return Promise.all(rooms.connectedUsers(roomId).map((user) => syncPermissions(roomId, user)));
}

export async function stopScreenShare(roomId: string, targetId: string) {
  const target = rooms.connectedUsers(roomId).find((user) => user.sub === targetId);
  if (!target) return;
  await applyPermissions(roomId, targetId, { ...rooms.publishInputs(roomId, target), canShare: false });
  setTimeout(() => void syncPermissions(roomId, target), 900);
}
