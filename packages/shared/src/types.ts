import { z } from "zod";
import { LOCAL_ID, localFileSchema } from "./local-file.ts";

export const SCREEN_PREFIX = "screen:";

export function screenId(identity: string) {
  return `${SCREEN_PREFIX}${identity}`;
}

export function isScreenId(id: string | null | undefined): id is `screen:${string}` {
  return typeof id === "string" && /^screen:[A-Za-z0-9_.-]{1,80}$/.test(id);
}

export function screenIdentity(id: string) {
  return id.slice(SCREEN_PREFIX.length);
}

export const roomIdSchema = z.string().regex(/^[a-z0-9]{8}$/);

export const roomSettingsSchema = z.object({
  guests: z.enum(["ask", "open", "closed"]),
  sharing: z.enum(["everyone", "controllers"]),
  locked: z.boolean(),
  autoplayNext: z.boolean(),
  reactions: z.boolean(),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const defaultRoomSettings: RoomSettings = { guests: "ask", sharing: "everyone", locked: false, autoplayNext: true, reactions: true };

export const REACTION_EMOJIS = ["🔥", "😂", "😮", "👏", "❤️", "🎉", "😢", "🤯"] as const;
export const reactionEmojiSchema = z.enum(REACTION_EMOJIS);
export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;

export function parseRoomCode(input: string): string | null {
  const text = input.trim().toLowerCase();
  const fromLink = text.match(/\/room\/([a-z0-9]{8})(?:[/?#]|$)/);
  const candidate = fromLink?.[1] ?? text.replace(/[^a-z0-9]/g, "");
  return /^[a-z0-9]{8}$/.test(candidate) ? candidate : null;
}

// Rejects control, zero-width and bidi-override characters that can spoof or break names in logs and UI.
export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .refine((value) => !/[\p{C}\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/u.test(value), "Names can't contain control or invisible characters.");

export const roomNameSchema = z.string().trim().max(40);

export const roomInfoSchema = z.object({
  id: roomIdSchema,
  name: z.string(),
  settings: roomSettingsSchema,
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
export const createRoomRequestSchema = z.object({ password: roomPasswordSchema.optional(), name: roomNameSchema.optional() });
export const joinRoomRequestSchema = z.object({ password: z.string().max(64).optional() });

export const mediaSourceSchema = z
  .object({
    type: z.enum(["youtube", "twitch", "local"]),
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    isLive: z.boolean(),
  })
  .refine((source) => source.type !== "local" || (LOCAL_ID.test(source.id) && !source.isLive), "Invalid local file");
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
  file: localFileSchema.optional(),
});
export type Stream = z.infer<typeof streamSchema>;

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export const playlistItemSchema = z.object({ id: z.string().regex(YOUTUBE_VIDEO_ID), title: z.string().max(120) });
export type PlaylistItem = z.infer<typeof playlistItemSchema>;

export const playlistSummarySchema = z.object({
  id: z.string().min(2).max(64),
  title: z.string().max(120),
  count: z.number().int().min(0),
  addedBy: z.object({ id: z.string(), name: z.string() }),
  addedAt: z.number(),
});
export type PlaylistSummary = z.infer<typeof playlistSummarySchema>;

export const queueItemSchema = z.object({
  id: z.string(),
  source: mediaSourceSchema,
  title: z.string().max(140),
  addedBy: z.object({ id: z.string(), name: z.string() }),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const LIMITS = { queue: 100, playlists: 5, playlistItems: 100 } as const;

export const tvModeSchema = z.enum(["here", "tv", "both"]);
export type TvMode = z.infer<typeof tvModeSchema>;

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  guest: z.boolean(),
  deafened: z.boolean(),
  watching: z.string().nullable(),
  tvOf: z.string().nullable(),
  tvMode: tvModeSchema.nullable(),
  feed: z.string().nullable().default(null),
});
export type Member = z.infer<typeof memberSchema>;

export const pendingRequestSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  requestedAt: z.number(),
});
export type PendingRequest = z.infer<typeof pendingRequestSchema>;

export const restrictionSchema = z.object({ muted: z.boolean(), deafened: z.boolean() });
export type Restriction = z.infer<typeof restrictionSchema>;

export const roomStateSchema = z.object({
  room: roomInfoSchema,
  streams: z.array(streamSchema),
  queue: z.array(queueItemSchema),
  playlists: z.array(playlistSummarySchema),
  featuredId: z.string().nullable(),
  members: z.array(memberSchema),
  restrictions: z.record(z.string(), restrictionSchema),
  pending: z.array(pendingRequestSchema),
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
  if (source.type === "local") return `local:${source.id}`;
  return source.type === "youtube" ? `youtube:${source.id}` : `twitch:${source.isLive ? "live" : "vod"}:${source.id}`;
}

export const tvCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/);

export const tvCredentialsSchema = z.object({
  wsTicket: z.string(),
  livekitToken: z.string(),
  livekitUrl: z.string(),
});
export type TvCredentials = z.infer<typeof tvCredentialsSchema>;

export const tvPairingSchema = z.object({ code: tvCodeSchema, secret: z.string(), expiresAt: z.number() });
export type TvPairing = z.infer<typeof tvPairingSchema>;

export const tvPollSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("approved") }).extend(tvCredentialsSchema.shape),
]);
export type TvPoll = z.infer<typeof tvPollSchema>;
