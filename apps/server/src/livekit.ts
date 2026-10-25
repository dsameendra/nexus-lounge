import { createHmac } from "node:crypto";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { ParticipantMetadata } from "@nexus/shared";
import type { SessionPayload } from "@nexus/shared/session-token";
import { config } from "./config.ts";

const rooms = new RoomServiceClient(config.LIVEKIT_URL.replace(/^ws/, "http"), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);

export interface PublishInputs {
  guest: boolean;
  micBlocked: boolean;
  canShare: boolean;
  canFeed: boolean;
}

// Local-file feeds travel as UNKNOWN-source tracks so they never count as a mic or a screen share.
export function grantFor({ guest, micBlocked, canShare, canFeed }: PublishInputs) {
  const sources: TrackSource[] = [];
  if (!micBlocked) sources.push(TrackSource.MICROPHONE);
  if (canShare && !guest) sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  if (canFeed && !guest) sources.push(TrackSource.UNKNOWN);
  return sources.length > 0 ? { canPublish: true, canPublishSources: sources } : { canPublish: false, canPublishSources: [] as TrackSource[] };
}

// livekit-server-sdk cannot encode the UNKNOWN source in a token, so add it to the signed claims ourselves.
export function allowFeedSource(jwt: string, secret: string) {
  const [header, body] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(body!, "base64url").toString()) as { video?: { canPublish?: boolean; canPublishSources?: string[] } };
  if (!claims.video) return jwt;
  claims.video.canPublish = true;
  claims.video.canPublishSources = [...(claims.video.canPublishSources ?? []), "unknown"];
  const payload = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
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
  const grant = grantFor(inputs);
  const sources = grant.canPublishSources.filter((source) => source !== TrackSource.UNKNOWN);
  token.addGrant({ room: roomId, roomJoin: true, canSubscribe: true, canPublishData: true, canPublish: sources.length > 0, canPublishSources: sources });
  const jwt = await token.toJwt();
  return grant.canPublishSources.length > sources.length ? allowFeedSource(jwt, config.LIVEKIT_API_SECRET) : jwt;
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

export async function closeVoiceRoom(roomId: string) {
  try {
    await rooms.deleteRoom(roomId);
    return true;
  } catch {
    return false;
  }
}

// Evicts voice participants who were removed from a room, and deletes voice rooms that no longer exist.
export async function reconcileVoice(hasRoom: (roomId: string) => boolean, removed: { roomId: string; identity: string }[]) {
  try {
    for (const voice of await rooms.listRooms()) {
      if (!hasRoom(voice.name)) await rooms.deleteRoom(voice.name);
    }
    for (const { roomId, identity } of removed) {
      if (hasRoom(roomId)) await rooms.removeParticipant(roomId, identity).catch(() => {});
    }
  } catch {}
}

export async function removeFromVoice(roomId: string, identity: string) {
  try {
    await rooms.removeParticipant(roomId, identity);
  } catch {}
}
