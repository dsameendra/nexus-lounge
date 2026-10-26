type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void | Promise<void> };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };

export function fullscreenSupported() {
  return Boolean(document.fullscreenEnabled || (document.documentElement as FullscreenEl).webkitRequestFullscreen);
}

export function isFullscreen() {
  return Boolean(document.fullscreenElement || (document as FullscreenDoc).webkitFullscreenElement);
}

export async function enterFullscreen(element: HTMLElement = document.documentElement) {
  const target = element as FullscreenEl;
  try {
    if (target.requestFullscreen) await target.requestFullscreen();
    else await target.webkitRequestFullscreen?.();
  } catch {}
}

export async function exitFullscreen() {
  const doc = document as FullscreenDoc;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc.webkitExitFullscreen?.();
  } catch {}
}
