import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const until = async (fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };

// Kick's player is stubbed so the suite needs no internet and no live channel.
const browser = await launch();
const { context, page: p } = await newPage(browser, { width: 1280, height: 800 });
await context.addCookies([await mintSession("discord-kick-owner", "Owner Kick")]);
const hits = [];
await context.route("https://player.kick.com/**", (route) => { hits.push(route.request().url()); return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>stub</title><body style='background:#123'>kick stub</body>" }); });
await p.goto(BASE); await p.click("text=Create room"); await p.waitForURL(/\/room\//);
await p.getByRole("button", { name: "Join room" }).click();
const add = async (url, mode) => {
  await p.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
  await p.fill("input[placeholder='Paste a YouTube, Twitch or Kick link']", url);
  return mode;
};
const kickFrames = () => p.locator("iframe[src*='player.kick.com']");

console.log("Adding a Kick channel");
await add("https://kick.com/examplechannel/videos/abc");
check(await p.getByText(/Kick videos and clips aren't supported/).isVisible(), "a Kick video link is refused with an explanation");
await p.fill("input[placeholder='Paste a YouTube, Twitch or Kick link']", "https://kick.com/ExampleChannel");
check(await p.getByText("Kick channel · examplechannel").isVisible(), "a channel link is recognised");
await p.getByRole("button", { name: "Play for everyone" }).click();
check(await until(async () => (await kickFrames().count()) === 1), "the Kick player appears in an iframe");
const src = await kickFrames().first().getAttribute("src");
check(src.startsWith("https://player.kick.com/examplechannel?") && src.includes("autoplay=true") && /muted=(true|false)/.test(src), "with the channel, autoplay and a muted setting in its address");
check((await kickFrames().first().getAttribute("allow"))?.includes("fullscreen"), "and permission to go fullscreen");
check(await p.getByText("Kick live streams can't be time-synced", { exact: false }).isVisible(), "the stage explains that live streams can't be synced");
check((await p.getByText("Live on Kick").count()) > 0, "the controls say Live on Kick");
check((await p.getByRole("button", { name: "Pause for everyone" }).count()) === 0, "there is no shared play and pause");

console.log("Nothing covers the player");
const box = await kickFrames().first().boundingBox();
const top = await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? el.tagName : null; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
check(top === "IFRAME", "the middle of the picture is the player itself, with no overlay on top");

console.log("Switching and muting");
await add("https://kick.com/otherchannel");
await p.getByRole("button", { name: "Play for everyone" }).click();
check(await until(async () => (await kickFrames().count()) === 1 && (await kickFrames().first().getAttribute("src")).includes("/otherchannel?")), "switching channels replaces the player instead of stacking another");
check((await kickFrames().count()) === 1, "still exactly one player");
await p.getByRole("button", { name: /Watch examplechannel/ }).click();
check(await until(async () => (await kickFrames().count()) === 1 && (await kickFrames().first().getAttribute("src")).includes("/examplechannel?")), "going back to the first channel works");

console.log("Another page");
const room = p.url();
const guest = await newPage(browser, { width: 1280, height: 800 });
await guest.context.addCookies([await mintSession("discord-kick-guest", "Guest Kick")]);
await guest.context.route("https://player.kick.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><body>kick stub</body>" }));
await guest.page.goto(room);
await guest.page.getByRole("button", { name: "Join room" }).click();
check(await until(async () => (await guest.page.locator("iframe[src*='player.kick.com']").count()) === 1), "a friend who joins gets the player too");

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : `All ${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
