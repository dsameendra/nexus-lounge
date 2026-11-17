const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
}

// Back to where focus was before a sheet or menu opened, unless the user has already moved it somewhere else.
// Still in the page means React is only re-running effects (Strict Mode), not closing it.
export function returnFocus(previous: Element | null, container: HTMLElement) {
  if (container.isConnected) return;
  const active = document.activeElement;
  if (active && active !== document.body && !container.contains(active)) return;
  if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) previous.focus({ preventScroll: true });
}
