import { AccessToken } from "livekit-server-sdk";
import type { ParticipantMetadata } from "@nexus/shared";
import type { SessionPayload } from "@nexus/shared/session-token";
import { config } from "./config.ts";

export async function createLivekitToken(roomId: string, user: SessionPayload) {
  const metadata: ParticipantMetadata = { image: user.image };
  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: user.sub,
    name: user.name,
    metadata: JSON.stringify(metadata),
    ttl: "6h",
  });
  token.addGrant({ room: roomId, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return token.toJwt();
}
