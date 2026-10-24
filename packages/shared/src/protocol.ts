import { z } from "zod";
import { roomIdSchema, roomInfoSchema } from "./types.ts";

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), roomId: roomIdSchema, token: z.string() }),
  z.object({ type: z.literal("ping"), clientTime: z.number() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room"), room: roomInfoSchema }),
  z.object({ type: z.literal("pong"), clientTime: z.number(), serverTime: z.number() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
