import { z } from "zod";
import { mediaSourceSchema, roomIdSchema, roomStateSchema } from "./types.ts";

const streamId = z.string().min(1).max(100);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), roomId: roomIdSchema, ticket: z.string() }),
  z.object({ type: z.literal("ping"), clientTime: z.number() }),
  z.object({ type: z.literal("stream.add"), source: mediaSourceSchema }),
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
  z.object({ type: z.literal("presence.watch"), streamId: streamId.nullable() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), state: roomStateSchema }),
  z.object({ type: z.literal("kicked") }),
  z.object({ type: z.literal("pong"), clientTime: z.number(), serverTime: z.number() }),
  z.object({ type: z.literal("error"), message: z.string(), fatal: z.boolean().optional() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
