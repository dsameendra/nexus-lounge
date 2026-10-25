import { fingerprint, fingerprintRanges } from "@nexus/shared";

interface FileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  queryPermission?(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "read" }): Promise<PermissionState>;
}

type WindowWithPicker = Window & {
  showOpenFilePicker?: (options: { multiple: boolean; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle[]>;
};

export type PickedFile = { file: File; handle: FileHandle | null };

export const VIDEO_TYPES = ".mp4,.m4v,.mov,.webm,.mkv,.ogv,video/*";
export const MAX_REMEMBERED = 20;

export function canRememberFiles() {
  return typeof window !== "undefined" && typeof (window as WindowWithPicker).showOpenFilePicker === "function" && typeof indexedDB !== "undefined";
}

export function canHostFeed() {
  if (typeof window === "undefined") return false;
  const video = document.createElement("video") as HTMLVideoElement & { captureStream?: unknown; mozCaptureStream?: unknown };
  const capture = typeof video.captureStream === "function" || typeof video.mozCaptureStream === "function" || typeof HTMLCanvasElement.prototype.captureStream === "function";
  return capture && typeof AudioContext !== "undefined" && typeof RTCPeerConnection !== "undefined";
}

export async function readFingerprint(file: File) {
  const parts = await Promise.all(fingerprintRanges(file.size).map(async ([start, end]) => new Uint8Array(await file.slice(start, end).arrayBuffer())));
  return fingerprint(file.size, parts);
}

export function describeMediaError(video: HTMLVideoElement, remote = false) {
  const code = video.error?.code;
  if (remote && (code === 2 || code === 4)) return "The stream couldn't be loaded. If it is a link, it may have expired, or the service may be limiting it.";
  if (code === 4) return "This browser can't play this file. MP4 (H.264/AAC) and WebM work everywhere.";
  if (code === 3) return "This file couldn't be decoded. It may be damaged, or use a format this browser can't play.";
  return "This file couldn't be opened.";
}

export function probeFile(file: File) {
  return new Promise<{ duration: number }>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const hasPicture = video.videoWidth > 0 && video.videoHeight > 0;
      done();
      if (!hasPicture) reject(new Error("This browser can play this file's sound but not its picture. MP4 (H.264/AAC) and WebM work everywhere."));
      else if (!Number.isFinite(duration) || duration <= 0) reject(new Error("This file has no length, so it can't be synced."));
      else resolve({ duration });
    };
    video.onerror = () => {
      const message = describeMediaError(video);
      done();
      reject(new Error(message));
    };
    video.src = url;
  });
}

export function pickFile(): Promise<PickedFile | null> {
  const picker = (window as WindowWithPicker).showOpenFilePicker;
  if (picker) {
    return picker
      .call(window, { multiple: false, types: [{ description: "Videos", accept: { "video/*": VIDEO_TYPES.split(",").filter((item) => item.startsWith(".")) } }] })
      .then(async ([handle]) => (handle ? { file: await handle.getFile(), handle } : null))
      .catch(() => null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = VIDEO_TYPES;
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0], handle: null } : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function fileFromDrop(event: DragEvent | React.DragEvent): Promise<PickedFile | null> {
  const item = event.dataTransfer?.items?.[0] as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileHandle | null> }) | undefined;
  const handle = await item?.getAsFileSystemHandle?.().catch(() => null);
  if (handle?.kind === "file") return { file: await handle.getFile(), handle };
  const file = event.dataTransfer?.files?.[0];
  return file ? { file, handle: null } : null;
}

// Remembered files (Chromium only): the browser keeps a handle, never the file.
const DB = "nexus-local-files";
const STORE = "handles";

interface Remembered {
  id: string;
  name: string;
  size: number;
  usedAt: number;
  handle: FileHandle;
}

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function rememberFile(id: string, file: File, handle: FileHandle | null) {
  if (!handle || !canRememberFiles()) return;
  try {
    await run("readwrite", (store) => store.put({ id, name: file.name, size: file.size, usedAt: Date.now(), handle } satisfies Remembered));
    const all = await run<Remembered[]>("readonly", (store) => store.getAll());
    for (const old of all.sort((a, b) => b.usedAt - a.usedAt).slice(MAX_REMEMBERED)) await run("readwrite", (store) => store.delete(old.id));
  } catch {}
}

export async function recallFile(id: string): Promise<Remembered | null> {
  if (!canRememberFiles()) return null;
  try {
    return (await run<Remembered | undefined>("readonly", (store) => store.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function forgetFiles() {
  try {
    await run("readwrite", (store) => store.clear());
  } catch {}
}

export async function openRemembered(remembered: Remembered, interactive: boolean): Promise<File | null> {
  const { handle } = remembered;
  try {
    let permission = (await handle.queryPermission?.({ mode: "read" })) ?? "granted";
    if (permission !== "granted" && interactive) permission = (await handle.requestPermission?.({ mode: "read" })) ?? "denied";
    return permission === "granted" ? await handle.getFile() : null;
  } catch {
    return null;
  }
}

export const formatBytes = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
export const formatLength = (seconds: number) => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`;
};
