import { z } from "zod";

export const SCREEN_ID = "screen";

export const roomIdSchema = z.string().regex(/^[a-z0-9]{8}$/);

export const roomInfoSchema = z.object({
  id: roomIdSchema,
  hostId: z.string(),
  controllerIds: z.array(z.string()),
  createdAt: z.number(),
  hasPassword: z.boolean(),
});
export type RoomInfo = z.infer<typeof roomInfoSchema>;

export const participantMetadataSchema = z.object({
  image: z.string().nullable(),
});
export type ParticipantMetadata = z.infer<typeof participantMetadataSchema>;

export const roomPasswordSchema = z.string().min(1).max(64);
export const createRoomRequestSchema = z.object({ password: roomPasswordSchema.optional() });
export const joinRoomRequestSchema = z.object({ password: z.string().max(64).optional() });

export const mediaSourceSchema = z.object({
  type: z.enum(["youtube", "twitch"]),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  isLive: z.boolean(),
});
export type MediaSource = z.infer<typeof mediaSourceSchema>;

export const playbackSchema = z.object({
  position: z.number().nullable(),
  playing: z.boolean(),
  updatedAt: z.number(),
});
export type Playback = z.infer<typeof playbackSchema>;

export const streamSchema = z.object({
  id: z.string(),
  source: mediaSourceSchema,
  title: z.string(),
  addedBy: z.object({ id: z.string(), name: z.string() }),
  addedAt: z.number(),
  playback: playbackSchema,
});
export type Stream = z.infer<typeof streamSchema>;

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  guest: z.boolean(),
  watching: z.string().nullable(),
});
export type Member = z.infer<typeof memberSchema>;

export const restrictionSchema = z.object({ muted: z.boolean(), deafened: z.boolean() });
export type Restriction = z.infer<typeof restrictionSchema>;

export const roomStateSchema = z.object({
  room: roomInfoSchema,
  streams: z.array(streamSchema),
  featuredId: z.string().nullable(),
  members: z.array(memberSchema),
  restrictions: z.record(z.string(), restrictionSchema),
  serverTime: z.number(),
});
export type RoomState = z.infer<typeof roomStateSchema>;

export const livekitTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
  room: roomInfoSchema,
  wsTicket: z.string(),
});
export type LivekitTokenResponse = z.infer<typeof livekitTokenResponseSchema>;

export const joinResponseSchema = livekitTokenResponseSchema.extend({ wsUrl: z.string() });
export type JoinResponse = z.infer<typeof joinResponseSchema>;

export function streamKey(source: MediaSource) {
  return source.type === "youtube" ? `youtube:${source.id}` : `twitch:${source.isLive ? "live" : "vod"}:${source.id}`;
}
