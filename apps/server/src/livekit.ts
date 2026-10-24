import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { ParticipantMetadata } from "@nexus/shared";
import type { SessionPayload } from "@nexus/shared/session-token";
import { config } from "./config.ts";

const rooms = new RoomServiceClient(config.LIVEKIT_URL.replace(/^ws/, "http"), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);

function publishPermission(guest: boolean, micBlocked: boolean) {
  if (!micBlocked) return { canPublish: true, canPublishSources: guest ? [TrackSource.MICROPHONE] : [] };
  if (guest) return { canPublish: false, canPublishSources: [] };
  return { canPublish: true, canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO, TrackSource.CAMERA] };
}

export async function applyMicRestriction(roomId: string, identity: string, guest: boolean, micBlocked: boolean) {
  try {
    await rooms.updateParticipant(roomId, identity, {
      permission: { canSubscribe: true, canPublishData: true, ...publishPermission(guest, micBlocked) },
    });
  } catch {}
}

export async function createLivekitToken(roomId: string, user: SessionPayload, micBlocked = false) {
  const metadata: ParticipantMetadata = { image: user.image };
  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: user.sub,
    name: user.name,
    metadata: JSON.stringify(metadata),
    ttl: "6h",
  });
  token.addGrant({
    room: roomId,
    roomJoin: true,
    canSubscribe: true,
    canPublishData: true,
    ...publishPermission(user.guest, micBlocked),
  });
  return token.toJwt();
}

export async function createViewerToken(roomId: string, identity: string, name: string) {
  const metadata: ParticipantMetadata = { image: null };
  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity,
    name,
    metadata: JSON.stringify(metadata),
    ttl: "12h",
  });
  token.addGrant({ room: roomId, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false });
  return token.toJwt();
}

export async function removeFromVoice(roomId: string, identity: string) {
  try {
    await rooms.removeParticipant(roomId, identity);
  } catch {}
}
