import { log } from "./log.ts";

type Hook = () => void | Promise<void>;

const hooks: Hook[] = [];

// Hooks run on SIGTERM/SIGINT after new WebSocket connections are refused and before open ones are closed,
// so they can still message every client.
export function onShutdown(hook: Hook) {
  hooks.push(hook);
}

export async function runShutdownHooks() {
  for (const hook of hooks) {
    try {
      await hook();
    } catch (error) {
      log.error({ err: error }, "Shutdown hook failed");
    }
  }
}
