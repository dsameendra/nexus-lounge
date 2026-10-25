import { z } from "zod";

export const LOCAL_ID = /^[a-f0-9]{32}$/;
export const FINGERPRINT_SLICE = 1024 * 1024;
export const MAX_FILE_BYTES = 2 ** 40;
export const MAX_FILE_SECONDS = 86400 * 2;
export const MAX_LOCAL_STREAMS_PER_USER = 5;

const INVISIBLE = /[\p{C}\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu;

export const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\p{C}\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/u.test(value), "File names can't contain control or invisible characters.");

export const localFileSchema = z.object({
  name: fileNameSchema,
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
  duration: z.number().min(0).max(MAX_FILE_SECONDS),
});
export type LocalFile = z.infer<typeof localFileSchema>;

export function cleanFileName(name: string) {
  return name.replace(INVISIBLE, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Video";
}

// Byte ranges that identify a file: all of it when small, otherwise the start, the middle and the end.
export function fingerprintRanges(size: number): [number, number][] {
  if (size <= FINGERPRINT_SLICE * 3) return [[0, size]];
  const middle = Math.floor(size / 2 - FINGERPRINT_SLICE / 2);
  return [
    [0, FINGERPRINT_SLICE],
    [middle, middle + FINGERPRINT_SLICE],
    [size - FINGERPRINT_SLICE, size],
  ];
}

export async function fingerprint(size: number, parts: Uint8Array[]) {
  const ranges = fingerprintRanges(size);
  if (parts.length !== ranges.length || parts.some((part, index) => part.byteLength !== ranges[index]![1] - ranges[index]![0])) {
    throw new Error("The file could not be read completely");
  }
  const header = new Uint8Array(8);
  new DataView(header.buffer).setBigUint64(0, BigInt(size), true);
  const body = new Uint8Array(8 + parts.reduce((total, part) => total + part.byteLength, 0));
  body.set(header);
  let offset = 8;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", body));
  return Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
