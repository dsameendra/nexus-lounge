import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const until = async (fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };

const browser = await launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const owner = await newPage(browser, { width: 1280, height: 800 });
await owner.context.addCookies([await mintSession("discord-tvout-owner", "Owner TV")]);
const p = owner.page;
await p.goto(BASE); await p.click("text=Create room"); await p.waitForURL(/\/room\//);
const room = p.url().split("/room/")[1];
await p.getByRole("button", { name: "Join room" }).click();
await p.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
await p.fill("input[placeholder='Paste a YouTube or Twitch link']", "https://www.youtube.com/watch?v=jNQXAC9IVRw");
await p.getByRole("button", { name: "Play for everyone" }).click();
await p.waitForSelector("iframe[src*=youtube]");
const frameShown = () => p.evaluate(() => { const f = document.querySelector("iframe[src*=youtube]"); return Boolean(f) && Number(getComputedStyle(f.parentElement).opacity) > 0; });

console.log("No TV connected");
check((await p.getByText(/Watch on ·/).count()) === 0, "the output picker is hidden when no TV is connected");
check(await frameShown(), "the video plays on this device");

console.log("Cast tab connects");
const tv = await newPage(browser, { width: 1920, height: 1080 });
await tv.context.addCookies([await mintSession("discord-tvout-owner", "Owner TV")]);
await tv.page.goto(`${BASE}/room/${room}/tv`);
await tv.page.getByRole("button", { name: "Start watching" }).click({ timeout: 20000 }).catch(() => {});
check(await until(async () => (await p.getByText(/Watch on ·/).count()) > 0), "the picker appears once your TV joins");
check(await p.getByRole("tab", { name: "This device" }).getAttribute("aria-selected") === "true", "This device is selected by default");

console.log("TV only");
await p.getByRole("tab", { name: "TV only" }).click();
check(await until(async () => !(await frameShown())), "the video turns off on this device");
check(await p.getByText("Playing on your TV").isVisible(), "a card explains it is playing on the TV");
check(await until(async () => (await tv.page.locator("iframe[src*=youtube]").count()) === 1), "the TV keeps playing");
check(await p.evaluate(() => localStorage.getItem(`nexus-output-${location.pathname.split("/")[2]}`)) === "tv", "the choice is remembered for this room");

console.log("Both");
await p.getByRole("button", { name: "Watch here too" }).click();
check(await until(frameShown), "Watch here too brings the video back");
check(await p.getByRole("tab", { name: "Both" }).getAttribute("aria-selected") === "true", "Both is selected");
const soundBtn = p.getByRole("button", { name: /Sound is off here/ });
check(await soundBtn.isVisible(), "this device starts muted so it does not echo the TV");
await soundBtn.click();
check(await p.getByRole("button", { name: "Sound on this device" }).isVisible(), "sound can be turned on here");

console.log("This device");
await p.getByRole("tab", { name: "This device" }).click();
check(await frameShown() && (await p.getByText("Playing on your TV").count()) === 0, "back to this device only");

console.log("TV leaves");
await p.getByRole("tab", { name: "TV only" }).click();
await until(async () => !(await frameShown()));
await tv.context.close();
check(await until(async () => (await p.getByText(/Watch on ·/).count()) === 0, 30000), "the picker disappears when the TV disconnects");
check(await until(frameShown), "the video comes back on this device automatically");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
