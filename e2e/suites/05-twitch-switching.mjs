import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const CHANNEL = process.env.TWITCH_CHANNEL ?? "xqc"; // must be live and not region-locked; the suite skips itself when it is offline
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const until = async (fn, timeout = 25000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(400); } return false; };

const browser = await launch();
const ua = (await (await browser.newContext()).newPage().then((p) => p.evaluate(() => navigator.userAgent))).replace("HeadlessChrome", "Chrome");
const { context, page } = await newPage(browser, { width: 1280, height: 800 }, { userAgent: ua });
await context.addCookies([await mintSession("discord-e5-owner", "Owner Five")]);
await page.goto(BASE); await page.click("text=Create room"); await page.waitForURL(/\/room\//);
const room = page.url().split("/room/")[1];
await page.goto(`${BASE}/room/${room}?debug`);
await page.getByRole("button", { name: "Join room" }).click();
const add = async (url, mode) => {
  await page.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
  await page.fill("input[placeholder='Paste a YouTube, Twitch or Kick link']", url);
  await page.getByRole("button", { name: mode }).click();
  await sleep(1500);
};
await add(`https://www.twitch.tv/${CHANNEL}`, "Play for everyone");
await add("https://www.youtube.com/watch?v=jNQXAC9IVRw", "Add to library");
const debug = async () => (await page.locator("pre").first().innerText().catch(() => ""));
const twitchPlaying = async () => new RegExp(`twitch:live:${CHANNEL} \\| state=playing`).test(await debug());

console.log("Twitch starts on its own");
await until(async () => (await twitchPlaying()) || (await page.getByText("This channel is offline right now.").count()) > 0, 40000);
if ((await page.getByText("This channel is offline right now.").count()) > 0) {
  console.log(`  - skipped: ${CHANNEL} is offline right now (set TWITCH_CHANNEL to a channel that is live)`);
  await browser.close();
  process.exit(0);
}
check(await until(twitchPlaying, 40000), "the Twitch channel is playing after loading");

console.log("Switching away and back");
await page.getByRole("button", { name: /Watch Me at the zoo/ }).click();
check(await until(async () => /youtube:jNQXAC9IVRw/.test(await debug()) || (await page.locator("iframe[src*='youtube']").count()) > 0, 20000), "switched to the YouTube video");
await sleep(3000);
await page.getByRole("button", { name: new RegExp(`Watch ${CHANNEL}`) }).click();
check(await until(async () => (await page.locator("iframe[src*='twitch']").count()) > 0 && (await page.locator("h1").first().innerText()).includes(CHANNEL)), "switched back to the Twitch channel");
check(await until(twitchPlaying, 30000), "it starts playing by itself, without clicking play");
await sleep(5000);
check(await twitchPlaying(), "and it keeps playing");
await page.screenshot({ path: "e2e5-twitch-switch.png" });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
