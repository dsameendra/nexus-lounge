// Regenerates the README shots that cover accounts, TV output and the phone player bar: node screenshots.mjs (stack running)
import { launch, newPage, sleep } from "./lib.mjs";
import { mintSession } from "./session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const browser = await launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

const owner = await newPage(browser, { width: 1280, height: 800 });
await owner.context.addCookies([await mintSession("discord-shot-owner", "Mika")]);
const p = owner.page;
await p.goto(`${BASE}/account`);
await p.getByLabel("Display name").fill("Mika");
await p.getByRole("button", { name: "Avatar wave" }).click();
await p.getByRole("button", { name: "Save changes" }).click();
await p.getByRole("status").filter({ hasText: "Saved" }).waitFor();
await p.setViewportSize({ width: 560, height: 900 });
await sleep(400);
await p.screenshot({ path: `${OUT}account.png` });

await p.setViewportSize({ width: 1280, height: 800 });
await p.goto(BASE); await p.getByRole("button", { name: "Create room" }).click(); await p.waitForURL(/\/room\//);
const room = p.url().split("/room/")[1];
await p.getByRole("button", { name: "Join room" }).click();
await p.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
await p.fill("input[placeholder='Paste a YouTube, Twitch or Kick link']", "https://www.youtube.com/watch?v=jNQXAC9IVRw");
await p.getByRole("button", { name: "Play for everyone" }).click();
await p.waitForSelector("iframe[src*=youtube]");
const tv = await newPage(browser, { width: 1280, height: 720 });
await tv.context.addCookies([await mintSession("discord-shot-owner", "Mika")]);
await tv.page.goto(`${BASE}/room/${room}/tv`);
await tv.page.getByRole("button", { name: "Start watching" }).click({ timeout: 20000 }).catch(() => {});
await p.getByText(/Watch on ·/).waitFor({ timeout: 20000 });
await sleep(5000);
await p.setViewportSize({ width: 1280, height: 860 }); await sleep(600);
await p.screenshot({ path: `${OUT}tv-output.png` });
await tv.context.close();

const phone = await newPage(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await phone.context.addCookies([await mintSession("discord-shot-phone", "Sam")]);
const m = phone.page;
await m.goto(`${BASE}/room/${room}`); await m.getByRole("button", { name: "Join room" }).click();
await m.waitForSelector("iframe[src*=youtube]"); await sleep(6000);
const box = await m.evaluate(() => { const r = document.querySelector("iframe[src*=youtube]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 3 }; });
await m.touchscreen.tap(box.x, box.y); await sleep(400);
await m.getByRole("button", { name: "More", exact: true }).tap(); await sleep(500);
await m.screenshot({ path: `${OUT}mobile-player-bar.png` });
await browser.close();
