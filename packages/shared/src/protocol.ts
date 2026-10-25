import { z } from "zod";
import { localFileSchema } from "./local-file.ts";
import { PLAYLIST_ID } from "./parse-url.ts";
import { YOUTUBE_VIDEO_ID, mediaSourceSchema, playlistItemSchema, reactionEmojiSchema, roomIdSchema, roomNameSchema, roomSettingsSchema, roomStateSchema, tvModeSchema } from "./types.ts";

const streamId = z.string().min(1).max(100);
const listId = z.string().min(2).max(64);
const queueId = z.string().min(1).max(40);
const position = z.enum(["end", "next"]);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), roomId: roomIdSchema, ticket: z.string() }),
  z.object({ type: z.literal("ping"), clientTime: z.number() }),
  z.object({ type: z.literal("stream.add"), source: mediaSourceSchema, file: localFileSchema.optional() }),
  z.object({ type: z.literal("stream.remove"), streamId }),
  z.object({
    type: z.literal("stream.control"),
    streamId,
    action: z.enum(["play", "pause", "seek"]),
    position: z.number().min(0).max(86400 * 2).nullable(),
  }),
  z.object({ type: z.literal("stream.establish"), streamId, position: z.number().min(0).max(86400 * 2) }),
  z.object({ type: z.literal("stream.feature"), streamId: streamId.nullable() }),
  z.object({ type: z.literal("role.setController"), userId: z.string(), enabled: z.boolean() }),
  z.object({ type: z.literal("moderation.set"), userId: z.string(), muted: z.boolean().optional(), deafened: z.boolean().optional() }),
  z.object({ type: z.literal("moderation.kick"), userId: z.string() }),
  z.object({ type: z.literal("join.respond"), userId: z.string(), allow: z.boolean() }),
  z.object({ type: z.literal("settings.update") }).extend(roomSettingsSchema.partial().shape).extend({ name: roomNameSchema.optional() }),
  z.object({ type: z.literal("stream.move"), streamId, direction: z.enum(["up", "down", "next"]) }),
  z.object({ type: z.literal("queue.advance"), fromStreamId: streamId }),
  z.object({ type: z.literal("playlist.add"), listId: listId.regex(PLAYLIST_ID) }),
  z.object({ type: z.literal("playlist.remove"), listId }),
  z.object({ type: z.literal("playlist.open"), listId }),
  z.object({ type: z.literal("queue.addPlaylist"), listId, videoIds: z.array(z.string().regex(YOUTUBE_VIDEO_ID)).max(100).optional(), position: position.default("end") }),
  z.object({ type: z.literal("queue.addStream"), streamId, position: position.default("end") }),
  z.object({ type: z.literal("queue.remove"), queueId }),
  z.object({ type: z.literal("queue.move"), queueId, direction: z.enum(["up", "down", "top"]) }),
  z.object({ type: z.literal("queue.clear") }),
  z.object({ type: z.literal("queue.playNow"), queueId }),
  z.object({ type: z.literal("reaction.send"), emoji: reactionEmojiSchema }),
  z.object({ type: z.literal("presence.voice"), deafened: z.boolean() }),
  z.object({ type: z.literal("share.stop"), userId: z.string() }),
  z.object({ type: z.literal("presence.watch"), streamId: streamId.nullable() }),
  z.object({ type: z.literal("presence.feed"), streamId: streamId.nullable() }),
  z.object({ type: z.literal("tv.output"), mode: tvModeSchema }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), state: roomStateSchema }),
  z.object({ type: z.literal("kicked") }),
  z.object({ type: z.literal("playlist.items"), listId, items: z.array(playlistItemSchema) }),
  z.object({ type: z.literal("reaction"), id: z.string(), emoji: reactionEmojiSchema, from: z.object({ id: z.string(), name: z.string() }) }),
  z.object({ type: z.literal("pong"), clientTime: z.number(), serverTime: z.number() }),
  z.object({ type: z.literal("error"), message: z.string(), fatal: z.boolean().optional() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
