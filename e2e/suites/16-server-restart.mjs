import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const PORT = Number(process.env.SERVER_PORT ?? 4000);
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const visible = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } };
const gone = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "hidden", timeout }); return true; } catch { return false; } };

// This suite starts and stops the sync server itself, so the web app must point at SERVER_PORT and nothing else may listen there.
const free = await new Promise((resolve) => { const probe = createServer().once("error", () => resolve(false)).listen(PORT, () => probe.close(() => resolve(true))); });
if (!free) {
  console.log(`  - SKIP: something already listens on :${PORT}. Stop the server (keep the web app running) and set SERVER_PORT to the port the web app uses.`);
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(join(tmpdir(), "nexus-e2e-restart-"));
const snapshotPath = join(dir, "rooms.json");
let server = null;
const boot = async (withSnapshot) => {
  server = spawn("node", ["--env-file-if-exists=../../.env", "src/index.ts"], {
    cwd: join(root, "apps/server"),
    env: { ...process.env, PORT: String(PORT), ROOMS_SNAPSHOT_PATH: withSnapshot ? snapshotPath : "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error("server did not start");
};
const stop = async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await exited;
};
process.on("exit", () => { server?.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); });

await boot(true);
const browser = await launch();
try {
  const { context, page: op } = await newPage(browser, { width: 1280, height: 800 });
  await context.addCookies([await mintSession("discord-e16-owner", "Owner Sixteen")]);

  console.log("A room with a stream");
  await op.goto(BASE);
  await op.fill("input[placeholder='Room name (optional)']", "Restart night");
  await op.click("text=Create room");
  await op.waitForURL(/\/room\//);
  const url = op.url();
  await op.getByRole("button", { name: "Join room" }).click();
  await op.getByRole("button", { name: /(?:Add a stream|Add)$/ }).first().click();
  await op.fill("input[placeholder='Paste a YouTube, Twitch or Kick link']", "https://www.youtube.com/watch?v=jNQXAC9IVRw");
  await op.getByRole("button", { name: "Play for everyone" }).click();
  const streams = op.locator("section[aria-label='Streams'] li");
  check(await visible(streams.filter({ hasText: "Me at the zoo" }), 20000), "the stream is in the library with its title");
  const titleBefore = (await streams.first().innerText()).split("\n")[0];
  check(await visible(op.locator("iframe[src*='youtube']"), 30000), "and its player is up");

  console.log("The server restarts with a snapshot");
  const notice = op.getByRole("status").filter({ hasText: "Server restarting, reconnecting…" });
  await stop();
  check(await visible(notice, 5000), "the page shows the restarting notice");
  const box = await notice.first().boundingBox();
  const onTop = box && await op.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent?.includes("Server restarting") ?? false, [box.x + box.width / 2, box.y + box.height / 2]);
  check(Boolean(box && box.x >= 0 && box.x + box.width <= 1280 && box.y >= 0 && box.y + box.height <= 800 && onTop), "inside the viewport and not covered");
  const player = await op.locator("iframe[src*='youtube']").first().boundingBox();
  check(Boolean(box && player && box.y + box.height <= player.y), "above the player, not over it");
  check((await op.getByText("Couldn't connect to the room").count()) === 0, "no error screen while the server is away");
  await sleep(2500);
  check(await notice.first().isVisible(), "still showing while the server is down");
  await boot(true);
  check(await gone(notice, 20000), "the notice goes once the connection is back");
  check(op.url() === url, "still in the same room");
  check(await visible(op.getByText("Restart night", { exact: true })), "with its name");
  check(await visible(streams, 10000) && (await streams.first().innerText()).split("\n")[0] === titleBefore, `and the stream (${titleBefore})`);
  check(await visible(op.locator("iframe[src*='youtube']"), 15000), "and its player");
  await op.screenshot({ path: "e2e-restart-back.png" });

  console.log("A restart without the snapshot still ends the room");
  await stop();
  check(await visible(notice, 5000), "the notice shows again");
  await boot(false);
  check(await visible(op.getByText("Room not found"), 20000), "after reconnecting the room is gone and the page says so");
  check(await gone(notice, 5000), "and the restarting notice is cleared");
} finally {
  await browser.close();
  await stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
