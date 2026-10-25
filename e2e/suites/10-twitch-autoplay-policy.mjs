import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const CHANNEL = process.env.TWITCH_CHANNEL ?? "xqc";
const VIDEO = process.env.TWITCH_VIDEO; // optional past broadcast id; the VOD check is skipped without it
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const until = async (fn, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(400); } return false; };

// Default autoplay policy (no flag) and a library card clicked after scrolling: the stage can be partly off screen when the Twitch player is created.
const browser = await launch({ strictAutoplay: true });
const ua = (await (await browser.newContext()).newPage().then((p) => p.evaluate(() => navigator.userAgent))).replace("HeadlessChrome", "Chrome");
const { context, page } = await newPage(browser, { width: 1280, height: 800 }, { userAgent: ua });
await context.addCookies([await mintSession("discord-e10-owner", "Owner Ten")]);
await page.goto(BASE); await page.click("text=Create room"); await page.waitForURL(/\/room\//);
await page.goto(`${page.url()}?debug`);
await page.getByRole("button", { name: "Join room" }).click();
const add = async (url) => {
  await page.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
  await page.fill("input[placeholder='Paste a YouTube or Twitch link']", url);
  await page.getByRole("button", { name: "Add to library" }).click();
  await sleep(1500);
};
await add("https://www.youtube.com/watch?v=jNQXAC9IVRw");
await add(`https://www.twitch.tv/${CHANNEL}`);
if (VIDEO) await add(`https://www.twitch.tv/videos/${VIDEO}`);

const twitchVideo = () => Promise.all(page.frames().filter((f) => f.url().includes("player.twitch.tv")).map((f) => f.evaluate(() => {
  const v = document.querySelector("video");
  return v ? !v.paused && v.readyState >= 3 : false;
}).catch(() => false))).then((all) => all.some(Boolean));
const stageVisible = () => page.evaluate(() => {
  const frame = document.querySelector("iframe[src*='player.twitch.tv']");
  const r = frame?.getBoundingClientRect();
  return Boolean(r && r.top >= 0 && r.bottom <= innerHeight);
});

const round = async (name, label) => {
  await page.getByRole("button", { name: /Watch Me at the zoo/ }).click();
  await sleep(3500);
  await page.getByRole("button", { name }).click();
  check(await until(async () => (await page.locator("iframe[src*='player.twitch.tv']").count()) > 0, 20000), `${label}: Twitch embed created`);
  if ((await page.getByText("This channel is offline right now.").count()) > 0) { console.log(`  - skipped: ${label} offline`); return; }
  check(await until(twitchVideo, 40000), `${label}: video is playing without clicking inside the embed`);
  check(await stageVisible(), `${label}: the embed is fully on screen`);
};
await round(new RegExp(`Watch ${CHANNEL}`), "live channel");
await round(new RegExp(`Watch ${CHANNEL}`), "live channel again");
if (VIDEO) await round(/Watch .*/i, "past broadcast");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
