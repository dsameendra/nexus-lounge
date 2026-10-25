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
const start = tv.page.getByRole("button", { name: "Start watching" });
await start.waitFor({ timeout: 20000 }).catch(() => {});
check(await tv.page.evaluate(() => getComputedStyle(document.querySelector("main")).cursor) !== "none", "the TV start screen keeps the mouse cursor visible");
check(await tv.page.evaluate(() => getComputedStyle(document.querySelector("button")).cursor) === "pointer", "the Start watching button looks clickable");
await start.click({ timeout: 5000 }).catch(() => {});
const cursorHidden = () => tv.page.evaluate(() => getComputedStyle(document.querySelector(".fixed.inset-0")).cursor === "none");
await tv.page.mouse.move(300, 300);
check(await until(async () => !(await cursorHidden()), 3000), "moving the mouse shows the cursor while watching");
check(await until(cursorHidden, 8000), "the cursor hides again after a few idle seconds");
await tv.page.mouse.move(500, 400);
check(await until(async () => !(await cursorHidden()), 3000), "and comes back as soon as it moves");
check(await until(async () => (await p.getByText(/Watch on ·/).count()) > 0), "the picker appears once your TV joins");
check(await p.getByRole("tab", { name: "Both" }).getAttribute("aria-selected") === "true", "Both is selected by default when a TV connects");
const tvShown = () => tv.page.evaluate(() => { const f = document.querySelector("iframe[src*=youtube]"); return Boolean(f) && Number(getComputedStyle(f.parentElement).opacity) > 0; });
check(await until(tvShown) && await frameShown(), "the video plays on both the TV and this device");
check(await p.getByRole("button", { name: "Sound plays here too" }).isVisible(), "sound comes from both by default");
await p.getByRole("button", { name: "Sound plays here too" }).click();
check(await p.getByRole("button", { name: "Sound only from the TV" }).isVisible(), "sound can be limited to the TV");
await p.getByRole("button", { name: "Sound only from the TV" }).click();

console.log("TV only");
await p.getByRole("tab", { name: "TV only" }).click();
check(await until(async () => !(await frameShown())), "the video turns off on this device");
check(await p.getByText("Playing on your TV").isVisible(), "a card explains it is playing on the TV");
check(await until(tvShown), "the TV keeps playing");
check(await p.evaluate(() => localStorage.getItem(`nexus-output-${location.pathname.split("/")[2]}`)) === "tv", "the choice is remembered for this room");
await p.getByRole("button", { name: "Watch here too" }).click();
check(await until(frameShown) && await p.getByRole("tab", { name: "Both" }).getAttribute("aria-selected") === "true", "Watch here too switches to Both");

console.log("This device only");
await p.getByRole("tab", { name: "This device" }).click();
check(await until(async () => await frameShown() && !(await tvShown())), "the video plays here and the TV stops");
check(await until(async () => (await tv.page.getByText(/playing on your other device/).count()) > 0), "the TV says the video is on your other device");
check((await p.getByText("Playing on your TV").count()) === 0, "no TV-only card on this device");

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
