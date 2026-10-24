import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { ParticipantMetadata } from "@nexus/shared";
import type { SessionPayload } from "@nexus/shared/session-token";
import { config } from "./config.ts";

const rooms = new RoomServiceClient(config.LIVEKIT_URL.replace(/^ws/, "http"), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);

export interface PublishInputs {
  guest: boolean;
  micBlocked: boolean;
  canShare: boolean;
}

function grantFor({ guest, micBlocked, canShare }: PublishInputs) {
  const sources: TrackSource[] = [];
  if (!micBlocked) sources.push(TrackSource.MICROPHONE);
  if (canShare && !guest) sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  return sources.length > 0 ? { canPublish: true, canPublishSources: sources } : { canPublish: false, canPublishSources: [] as TrackSource[] };
}

export async function applyPermissions(roomId: string, identity: string, inputs: PublishInputs) {
  try {
    await rooms.updateParticipant(roomId, identity, { permission: { canSubscribe: true, canPublishData: true, ...grantFor(inputs) } });
  } catch {}
}

export async function createLivekitToken(roomId: string, user: SessionPayload, inputs: PublishInputs) {
  const metadata: ParticipantMetadata = { image: user.image };
  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: user.sub,
    name: user.name,
    metadata: JSON.stringify(metadata),
    ttl: "6h",
  });
  token.addGrant({ room: roomId, roomJoin: true, canSubscribe: true, canPublishData: true, ...grantFor(inputs) });
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
