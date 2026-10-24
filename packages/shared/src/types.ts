import { z } from "zod";

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

export const livekitTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
  room: roomInfoSchema,
});
export type LivekitTokenResponse = z.infer<typeof livekitTokenResponseSchema>;

export const roomPasswordSchema = z.string().min(1).max(64);

export const createRoomRequestSchema = z.object({ password: roomPasswordSchema.optional() });
export const joinRoomRequestSchema = z.object({ password: z.string().max(64).optional() });
