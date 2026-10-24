import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const browser = await launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const owner = await newPage(browser, { width: 1280, height: 800 });
await owner.context.addCookies([await mintSession("discord-lay-1", "Layout Owner")]);
await owner.page.goto(BASE); await owner.page.click("text=Create room"); await owner.page.waitForURL(/\/room\//);
const room = owner.page.url().split("/room/")[1];
await owner.page.getByRole("button", { name: "Join room" }).click();
await owner.page.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
await owner.page.fill("input[placeholder='Paste a YouTube or Twitch link']", "https://www.youtube.com/watch?v=jNQXAC9IVRw");
await owner.page.getByRole("button", { name: "Play for everyone" }).click();
await sleep(1500);

for (const [label, viewport] of [["phone-portrait", { width: 390, height: 844 }], ["phone-landscape", { width: 844, height: 390 }], ["tablet", { width: 820, height: 1180 }]]) {
  const { context, page } = await newPage(browser, viewport, { isMobile: label.startsWith("phone"), hasTouch: label.startsWith("phone") });
  await context.addCookies([await mintSession(`discord-lay-${label}`, `Viewer ${label}`)]);
  await page.goto(`${BASE}/room/${room}`);
  await page.getByRole("button", { name: "Join room" }).click();
  await sleep(9000);
  await page.screenshot({ path: `layout-${label}.png` });
  const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > window.innerWidth + 1, panel: !!document.querySelector("button[aria-label='Voice settings']") }));
  console.log(label, JSON.stringify(overflow));
  if (overflow.x) { console.log("  ✗ FAIL horizontal overflow on", label); process.exitCode = 1; }
  await context.close();
}

console.log("TV mode (signed-in cast tab)");
const tv = await newPage(browser, { width: 1920, height: 1080 });
await tv.context.addCookies([await mintSession("discord-lay-tv", "TV Caster")]);
await tv.page.goto(`${BASE}/room/${room}/tv`);
await tv.page.getByRole("button", { name: "Start watching" }).click({ timeout: 30000 });
await sleep(9000);
await tv.page.screenshot({ path: "layout-tv.png" });
console.log("tv iframe present:", await tv.page.locator("iframe[src*='youtube']").count());
await browser.close();
