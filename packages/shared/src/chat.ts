import { z } from "zod";

export const CHAT_MAX_LENGTH = 500;
export const CHAT_HISTORY = 100;

export const chatLineSchema = z.object({
  id: z.string(),
  from: z.object({ id: z.string(), name: z.string() }),
  text: z.string(),
  at: z.number(),
});
export type ChatLine = z.infer<typeof chatLineSchema>;

// Control and invisible characters, the same set room and member names are cleaned of.
export const stripInvisible = (value: string) => value.replace(/[\p{C}\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu, "");

// Null when nothing is left or it is too long.
export function cleanChatText(text: string) {
  const cleaned = stripInvisible(text).trim();
  return cleaned.length > 0 && cleaned.length <= CHAT_MAX_LENGTH ? cleaned : null;
}

export function appendChat<T extends ChatLine>(lines: T[], line: T, limit = CHAT_HISTORY) {
  return [...lines, line].slice(-limit);
}

// Union by id (lines already held win), in time order, newest `limit` kept.
export function mergeChat<T extends ChatLine>(current: T[], incoming: T[], limit = CHAT_HISTORY) {
  const ids = new Set(current.map((line) => line.id));
  const added = incoming.filter((line) => !ids.has(line.id));
  if (added.length === 0) return current;
  return [...current, ...added].sort((a, b) => a.at - b.at).slice(-limit);
}
