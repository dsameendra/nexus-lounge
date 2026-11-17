const BASE_MS = 400;
const MAX_MS = 5000;

// Exponential backoff with jitter: between half and all of the capped delay, so clients dropped together don't return together.
export function reconnectDelay(attempt: number, random: () => number = Math.random) {
  const capped = Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(capped / 2 + (capped / 2) * random());
}
