const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
}

// Back to where focus was before a sheet or menu opened, unless the user has already moved it somewhere else.
export function returnFocus(previous: Element | null, container: HTMLElement) {
  const active = document.activeElement;
  if (active && active !== document.body && !container.contains(active)) return;
  if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) previous.focus({ preventScroll: true });
}
